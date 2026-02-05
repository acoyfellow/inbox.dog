import { Effect, Context, Layer, pipe } from 'effect';
import { Schema } from '@effect/schema';
import { NotFoundError } from '../errors';
import { ApiKeySchema, OAuthStateSchema, type ApiKey, type OAuthState } from '../schemas';

// Service interface
export interface KVService {
  readonly getApiKey: (clientId: string) => Effect.Effect<ApiKey, NotFoundError>;
  readonly putApiKey: (clientId: string, apiKey: ApiKey) => Effect.Effect<void, never>;
  readonly getOAuthState: (stateId: string) => Effect.Effect<OAuthState, NotFoundError>;
  readonly putOAuthState: (stateId: string, state: OAuthState, ttlSeconds: number) => Effect.Effect<void, never>;
  readonly deleteOAuthState: (stateId: string) => Effect.Effect<void, never>;
  readonly putAuthCode: (
    code: string,
    data: { accessToken: string; refreshToken: string; expiresIn: number; email: string; clientId: string },
    ttlSeconds: number
  ) => Effect.Effect<void, never>;
  readonly getAuthCode: (
    code: string
  ) => Effect.Effect<
    { accessToken: string; refreshToken: string; expiresIn: number; email: string; clientId: string },
    NotFoundError
  >;
  readonly deleteAuthCode: (code: string) => Effect.Effect<void, never>;
}

export const KVService = Context.GenericTag<KVService>('KVService');

// Create service from KV namespace
export const makeKVService = (kv: KVNamespace): KVService => ({
  getApiKey(clientId) {
    return pipe(
      Effect.tryPromise({
        try: () => kv.get(`apikey:${clientId}`, 'json'),
        catch: () => new NotFoundError({ resource: 'ApiKey', id: clientId }),
      }),
      Effect.flatMap((data) =>
        data === null
          ? Effect.fail(new NotFoundError({ resource: 'ApiKey', id: clientId }))
          : pipe(
              Schema.decodeUnknown(ApiKeySchema)(data),
              Effect.mapError(() => new NotFoundError({ resource: 'ApiKey', id: clientId }))
            )
      )
    );
  },

  putApiKey(clientId, apiKey) {
    return Effect.promise(() => kv.put(`apikey:${clientId}`, JSON.stringify(apiKey)));
  },

  getOAuthState(stateId) {
    return pipe(
      Effect.tryPromise({
        try: () => kv.get(`oauth_state:${stateId}`, 'json'),
        catch: () => new NotFoundError({ resource: 'OAuthState', id: stateId }),
      }),
      Effect.flatMap((data) =>
        data === null
          ? Effect.fail(new NotFoundError({ resource: 'OAuthState', id: stateId }))
          : pipe(
              Schema.decodeUnknown(OAuthStateSchema)(data),
              Effect.mapError(() => new NotFoundError({ resource: 'OAuthState', id: stateId }))
            )
      )
    );
  },

  putOAuthState(stateId, state, ttlSeconds) {
    return Effect.promise(() =>
      kv.put(`oauth_state:${stateId}`, JSON.stringify(state), { expirationTtl: ttlSeconds })
    );
  },

  deleteOAuthState(stateId) {
    return Effect.promise(() => kv.delete(`oauth_state:${stateId}`));
  },

  putAuthCode(code, data, ttlSeconds) {
    return Effect.promise(() => kv.put(`auth_code:${code}`, JSON.stringify(data), { expirationTtl: ttlSeconds }));
  },

  getAuthCode(code) {
    return pipe(
      Effect.tryPromise({
        try: () => kv.get(`auth_code:${code}`, 'json'),
        catch: () => new NotFoundError({ resource: 'AuthCode', id: code }),
      }),
      Effect.flatMap((data) =>
        data === null
          ? Effect.fail(new NotFoundError({ resource: 'AuthCode', id: code }))
          : Effect.succeed(
              data as { accessToken: string; refreshToken: string; expiresIn: number; email: string; clientId: string }
            )
      )
    );
  },

  deleteAuthCode(code) {
    return Effect.promise(() => kv.delete(`auth_code:${code}`));
  },
});

export const KVServiceLive = (kv: KVNamespace) => Layer.succeed(KVService, makeKVService(kv));
