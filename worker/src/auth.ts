import { Effect } from 'effect';
import { KVService } from './services/kv';
import { InvalidCredentialsError } from './errors';
import { timingSafeEqual } from './utils';
import type { ApiKey } from './schemas';

/**
 * Authenticate an API key by client_id and client_secret.
 * Returns the ApiKey on success, fails with InvalidCredentialsError on mismatch.
 */
export const authenticateApiKey = (
  clientId: string,
  clientSecret: string,
): Effect.Effect<
  ApiKey,
  InvalidCredentialsError | import('./errors').NotFoundError | import('./services/kv').DecodeError,
  KVService
> =>
  Effect.gen(function* () {
    const kv = yield* KVService;
    const apiKey = yield* kv.getApiKey(clientId);

    const secretMatch = yield* Effect.promise(() =>
      timingSafeEqual(apiKey.clientSecret, clientSecret),
    );
    if (!secretMatch) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Invalid client_secret' }),
      );
    }

    return apiKey;
  });
