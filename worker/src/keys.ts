import { Effect, Schema } from 'effect';
import { KVService } from './services/kv';
import { ValidationError } from './errors';
import { generateId, generateSecret } from './utils';
import type { ApiKey } from './schemas';

// Schema for key creation requests (shared by POST /api/keys and POST /oauth/register)
export const CreateKeyBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  client_name: Schema.optional(Schema.String),
  redirect_uris: Schema.optional(Schema.Array(Schema.String)),
});

export type CreateKeyBody = typeof CreateKeyBody.Type;

/**
 * Validate redirect URIs: must be valid URLs with https (or http for localhost).
 */
const validateRedirectUris = (
  uris: readonly string[],
): Effect.Effect<void, ValidationError> => {
  for (const uri of uris) {
    try {
      const parsed = new URL(uri);
      if (
        parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')
      ) {
        return Effect.fail(
          new ValidationError({
            field: 'redirect_uris',
            message: `Invalid redirect_uri: ${uri}. Must use HTTPS (or HTTP for localhost).`,
          }),
        );
      }
    } catch {
      return Effect.fail(
        new ValidationError({
          field: 'redirect_uris',
          message: `Invalid redirect_uri: ${uri}. Must be a valid URL.`,
        }),
      );
    }
  }
  return Effect.void;
};

/**
 * Shared Effect that creates an API key and persists it to KV.
 * Used by both `POST /api/keys` and `POST /oauth/register`.
 */
export const createApiKey = (
  opts: { name?: string; redirectUris?: readonly string[] },
): Effect.Effect<ApiKey, ValidationError, KVService> =>
  Effect.gen(function* () {
    const kv = yield* KVService;
    const redirectUris = opts.redirectUris ?? [];

    yield* validateRedirectUris(redirectUris);

    const clientId = `id_${generateId()}`;
    const clientSecret = `sk_${generateSecret()}`;

    const apiKey: ApiKey = {
      id: generateId(),
      clientId,
      clientSecret,
      name: opts.name ?? 'default',
      createdAt: Date.now(),
      credits: 10,
      redirectUris: [...redirectUris],
    };

    yield* kv.putApiKey(clientId, apiKey);

    return apiKey;
  });
