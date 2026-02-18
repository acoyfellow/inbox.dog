import { Effect, Layer } from 'effect';
import type { Env } from './types';
import { ConfigService, ConfigServiceLive } from './services/config';
import { GoogleOAuthService, GoogleOAuthServiceLive } from './services/google';
import { KVService, KVServiceLive } from './services/kv';

// ---------------------------------------------------------------------------
// App-wide service union
// ---------------------------------------------------------------------------

export type AppServices = GoogleOAuthService | KVService | ConfigService;

// ---------------------------------------------------------------------------
// Layer builder — creates a fresh layer from the request's Env bindings
// ---------------------------------------------------------------------------

export const makeAppLayer = (env: Env) =>
  Layer.mergeAll(
    GoogleOAuthServiceLive,
    KVServiceLive(env.KV, env.ENCRYPTION_SECRET),
    ConfigServiceLive(env)
  );

// ---------------------------------------------------------------------------
// Runners — thin wrappers that provide the layer and run the Effect
//
// These avoid ManagedRuntime entirely. Each request builds a layer, provides
// it to the Effect, and runs it with Effect.runPromise. No resource leaks,
// no lifecycle management needed.
// ---------------------------------------------------------------------------

/**
 * Run an Effect with all app services provided.
 * Throws on failure (use in routes where you catch in Hono error handler).
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  env: Env
): Promise<A> => {
  const layer = makeAppLayer(env);
  return Effect.runPromise(Effect.provide(effect, layer));
};

/**
 * Run an Effect and return a discriminated result object.
 * Never throws — use when you want to pattern-match on success/failure in route handlers.
 */
export const runEffectEither = async <A, E>(
  effect: Effect.Effect<A, E, AppServices>,
  env: Env
): Promise<{ ok: true; value: A } | { ok: false; error: E }> => {
  const layer = makeAppLayer(env);
  const result = await Effect.runPromise(
    Effect.provide(Effect.either(effect), layer)
  );
  if (result._tag === 'Right') return { ok: true, value: result.right };
  return { ok: false, error: result.left };
};
