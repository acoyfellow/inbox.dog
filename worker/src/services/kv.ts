import { Effect, Context, Layer, Schema } from 'effect';
import { NotFoundError } from '../errors';
import {
  ApiKeySchema,
  OAuthStateSchema,
  AuthCodeDataSchema,
  McpSessionDataSchema,
  BindSessionSchema,
  GmailTokensSchema,
  type ApiKey,
  type OAuthState,
  type AuthCodeData,
  type McpSessionData,
  type BindSession,
  type GmailTokens,
} from '../schemas';
import { encrypt, decrypt } from '../crypto';

// ---------------------------------------------------------------------------
// Decode error — surfaces schema validation failures distinctly from not-found
// ---------------------------------------------------------------------------

import { Data } from 'effect';

export class DecodeError extends Data.TaggedError('DecodeError')<{
  readonly resource: string;
  readonly id: string;
  readonly cause: unknown;
}> {}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface KVService {
  // API keys
  readonly getApiKey: (clientId: string) => Effect.Effect<ApiKey, NotFoundError | DecodeError>;
  readonly putApiKey: (clientId: string, apiKey: ApiKey) => Effect.Effect<void, never>;
  readonly deleteApiKey: (clientId: string) => Effect.Effect<void, never>;

  // OAuth state
  readonly getOAuthState: (stateId: string) => Effect.Effect<OAuthState, NotFoundError | DecodeError>;
  readonly putOAuthState: (stateId: string, state: OAuthState, ttlSeconds: number) => Effect.Effect<void, never>;
  readonly deleteOAuthState: (stateId: string) => Effect.Effect<void, never>;

  // Auth codes (encrypted)
  readonly putAuthCode: (code: string, data: AuthCodeData, ttlSeconds: number) => Effect.Effect<void, never>;
  readonly getAuthCode: (code: string) => Effect.Effect<AuthCodeData, NotFoundError | DecodeError>;
  readonly deleteAuthCode: (code: string) => Effect.Effect<void, never>;

  // MCP sessions
  readonly getMcpSession: (sessionId: string) => Effect.Effect<McpSessionData, NotFoundError | DecodeError>;
  readonly putMcpSession: (sessionId: string, data: McpSessionData, ttlSeconds: number) => Effect.Effect<void, never>;
  readonly deleteMcpSession: (sessionId: string) => Effect.Effect<void, never>;

  // Bind sessions (web flow, short-lived)
  readonly getBindSession: (token: string) => Effect.Effect<BindSession, NotFoundError | DecodeError>;
  readonly putBindSession: (token: string, data: BindSession, ttlSeconds: number) => Effect.Effect<void, never>;
  readonly deleteBindSession: (token: string) => Effect.Effect<void, never>;

  // Gmail tokens (web bind, per API key)
  readonly getGmailTokens: (clientId: string) => Effect.Effect<GmailTokens, NotFoundError | DecodeError>;
  readonly putGmailTokens: (clientId: string, data: GmailTokens, ttlSeconds?: number) => Effect.Effect<void, never>;

  // Credit operations
  // NOTE: These do read-modify-write on KV which is NOT truly atomic.
  // KV is eventually consistent — concurrent writes can race.
  // For production credit handling, migrate to D1 (SQL transactions)
  // or Durable Objects (single-threaded actor model) for true atomicity.
  readonly deductCredit: (clientId: string) => Effect.Effect<ApiKey, NotFoundError | DecodeError>;
  readonly addCredits: (clientId: string, amount: number) => Effect.Effect<ApiKey, NotFoundError | DecodeError>;
}

export const KVService = Context.GenericTag<KVService>('KVService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch from KV + schema-decode, producing NotFoundError or DecodeError */
const getAndDecode = <A, I>(
  kv: KVNamespace,
  key: string,
  schema: Schema.Schema<A, I>,
  resource: string,
  id: string,
): Effect.Effect<A, NotFoundError | DecodeError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => kv.get(key, 'json'),
      catch: () => new NotFoundError({ resource, id }),
    });

    if (raw === null) {
      return yield* Effect.fail(new NotFoundError({ resource, id }));
    }

    return yield* Schema.decodeUnknown(schema)(raw).pipe(
      Effect.mapError((cause) => new DecodeError({ resource, id, cause }))
    );
  });

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const makeKVService = (kv: KVNamespace, encryptionSecret?: string): KVService => ({
  // -- API keys -------------------------------------------------------------

  getApiKey(clientId) {
    return getAndDecode(kv, `apikey:${clientId}`, ApiKeySchema, 'ApiKey', clientId);
  },

  putApiKey(clientId, apiKey) {
    return Effect.promise(() => kv.put(`apikey:${clientId}`, JSON.stringify(apiKey)));
  },

  deleteApiKey(clientId) {
    return Effect.promise(() => kv.delete(`apikey:${clientId}`));
  },

  // -- OAuth state -----------------------------------------------------------

  getOAuthState(stateId) {
    return getAndDecode(kv, `oauth_state:${stateId}`, OAuthStateSchema, 'OAuthState', stateId);
  },

  putOAuthState(stateId, state, ttlSeconds) {
    return Effect.promise(() =>
      kv.put(`oauth_state:${stateId}`, JSON.stringify(state), { expirationTtl: ttlSeconds })
    );
  },

  deleteOAuthState(stateId) {
    return Effect.promise(() => kv.delete(`oauth_state:${stateId}`));
  },

  // -- Auth codes (encrypted) -----------------------------------------------

  putAuthCode(code, data, ttlSeconds) {
    return Effect.gen(function* () {
      const json = JSON.stringify(data);
      const value = encryptionSecret
        ? yield* Effect.promise(() => encrypt(json, encryptionSecret))
        : json;
      yield* Effect.promise(() =>
        kv.put(`auth_code:${code}`, value, { expirationTtl: ttlSeconds })
      );
    });
  },

  getAuthCode(code) {
    return Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: () => kv.get(`auth_code:${code}`, 'text'),
        catch: () => new NotFoundError({ resource: 'AuthCode', id: code }),
      });

      if (raw === null) {
        return yield* Effect.fail(new NotFoundError({ resource: 'AuthCode', id: code }));
      }

      const jsonStr = encryptionSecret
        ? yield* Effect.tryPromise({
            try: () => decrypt(raw, encryptionSecret),
            catch: () => new DecodeError({ resource: 'AuthCode', id: code, cause: 'decryption failed' }),
          })
        : raw;

      const parsed = yield* Effect.try({
        try: () => JSON.parse(jsonStr) as unknown,
        catch: () => new DecodeError({ resource: 'AuthCode', id: code, cause: 'invalid JSON' }),
      });

      return yield* Schema.decodeUnknown(AuthCodeDataSchema)(parsed).pipe(
        Effect.mapError((cause) => new DecodeError({ resource: 'AuthCode', id: code, cause }))
      );
    });
  },

  deleteAuthCode(code) {
    return Effect.promise(() => kv.delete(`auth_code:${code}`));
  },

  // -- MCP sessions (encrypted when encryptionSecret is set) ----------------

  getMcpSession(sessionId) {
    return Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: () => kv.get(`mcp_session:${sessionId}`, 'text'),
        catch: () => new NotFoundError({ resource: 'McpSession', id: sessionId }),
      });

      if (raw === null) {
        return yield* Effect.fail(new NotFoundError({ resource: 'McpSession', id: sessionId }));
      }

      const jsonStr = encryptionSecret
        ? yield* Effect.tryPromise({
            try: () => decrypt(raw, encryptionSecret),
            catch: () =>
              new DecodeError({ resource: 'McpSession', id: sessionId, cause: 'decryption failed' }),
          })
        : raw;

      const parsed = yield* Effect.try({
        try: () => JSON.parse(jsonStr) as unknown,
        catch: () => new DecodeError({ resource: 'McpSession', id: sessionId, cause: 'invalid JSON' }),
      });

      return yield* Schema.decodeUnknown(McpSessionDataSchema)(parsed).pipe(
        Effect.mapError((cause) => new DecodeError({ resource: 'McpSession', id: sessionId, cause }))
      );
    });
  },

  putMcpSession(sessionId, data, ttlSeconds) {
    return Effect.gen(function* () {
      const json = JSON.stringify(data);
      const value = encryptionSecret
        ? yield* Effect.promise(() => encrypt(json, encryptionSecret))
        : json;
      yield* Effect.promise(() =>
        kv.put(`mcp_session:${sessionId}`, value, { expirationTtl: ttlSeconds })
      );
    });
  },

  deleteMcpSession(sessionId) {
    return Effect.promise(() => kv.delete(`mcp_session:${sessionId}`));
  },

  // -- Bind sessions (web flow) ----------------------------------------------

  getBindSession(token) {
    return getAndDecode(kv, `bind_session:${token}`, BindSessionSchema, 'BindSession', token);
  },

  putBindSession(token, data, ttlSeconds) {
    return Effect.promise(() =>
      kv.put(`bind_session:${token}`, JSON.stringify(data), { expirationTtl: ttlSeconds })
    );
  },

  deleteBindSession(token) {
    return Effect.promise(() => kv.delete(`bind_session:${token}`));
  },

  // -- Gmail tokens (web bind, encrypted when encryptionSecret is set) --------

  getGmailTokens(clientId) {
    return Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: () => kv.get(`gmail_tokens:${clientId}`, 'text'),
        catch: () => new NotFoundError({ resource: 'GmailTokens', id: clientId }),
      });

      if (raw === null) {
        return yield* Effect.fail(new NotFoundError({ resource: 'GmailTokens', id: clientId }));
      }

      const jsonStr = encryptionSecret
        ? yield* Effect.tryPromise({
            try: () => decrypt(raw, encryptionSecret),
            catch: () =>
              new DecodeError({ resource: 'GmailTokens', id: clientId, cause: 'decryption failed' }),
          })
        : raw;

      const parsed = yield* Effect.try({
        try: () => JSON.parse(jsonStr) as unknown,
        catch: () => new DecodeError({ resource: 'GmailTokens', id: clientId, cause: 'invalid JSON' }),
      });

      return yield* Schema.decodeUnknown(GmailTokensSchema)(parsed).pipe(
        Effect.mapError((cause) => new DecodeError({ resource: 'GmailTokens', id: clientId, cause }))
      );
    });
  },

  putGmailTokens(clientId, data, ttlSeconds = 90 * 24 * 60 * 60) {
    return Effect.gen(function* () {
      const json = JSON.stringify(data);
      const value = encryptionSecret
        ? yield* Effect.promise(() => encrypt(json, encryptionSecret))
        : json;
      yield* Effect.promise(() =>
        kv.put(`gmail_tokens:${clientId}`, value, { expirationTtl: ttlSeconds })
      );
    });
  },

  // -- Credit operations (read-modify-write, NOT truly atomic on KV) --------

  deductCredit(clientId) {
    return Effect.gen(function* () {
      const apiKey = yield* getAndDecode(kv, `apikey:${clientId}`, ApiKeySchema, 'ApiKey', clientId);
      const updated: ApiKey = { ...apiKey, credits: apiKey.credits - 1 };
      yield* Effect.promise(() => kv.put(`apikey:${clientId}`, JSON.stringify(updated)));
      return updated;
    });
  },

  addCredits(clientId, amount) {
    return Effect.gen(function* () {
      const apiKey = yield* getAndDecode(kv, `apikey:${clientId}`, ApiKeySchema, 'ApiKey', clientId);
      const updated: ApiKey = { ...apiKey, credits: apiKey.credits + amount };
      yield* Effect.promise(() => kv.put(`apikey:${clientId}`, JSON.stringify(updated)));
      return updated;
    });
  },
});

// ---------------------------------------------------------------------------
// Layer constructor
// ---------------------------------------------------------------------------

export const KVServiceLive = (kv: KVNamespace, encryptionSecret?: string) =>
  Layer.succeed(KVService, makeKVService(kv, encryptionSecret));
