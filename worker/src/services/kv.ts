import { Effect, Context, Layer, Schema } from 'effect';
import { NotFoundError } from '../errors';
import {
  ApiKeySchema,
  OAuthStateSchema,
  AuthCodeDataSchema,
  McpSessionDataSchema,
  type ApiKey,
  type OAuthState,
  type AuthCodeData,
  type McpSessionData,
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

  // -- MCP sessions ---------------------------------------------------------

  getMcpSession(sessionId) {
    return getAndDecode(kv, `mcp_session:${sessionId}`, McpSessionDataSchema, 'McpSession', sessionId);
  },

  putMcpSession(sessionId, data, ttlSeconds) {
    return Effect.promise(() =>
      kv.put(`mcp_session:${sessionId}`, JSON.stringify(data), { expirationTtl: ttlSeconds })
    );
  },

  deleteMcpSession(sessionId) {
    return Effect.promise(() => kv.delete(`mcp_session:${sessionId}`));
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
