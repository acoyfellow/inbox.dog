import { Hono } from 'hono';
import { Effect, Schema } from 'effect';
import type { Env } from '../types';
import { KVService } from '../services/kv';
import { timingSafeEqual } from '../utils';
import {
  InvalidCredentialsError,
  ValidationError,
  StripeError,
} from '../errors';
import { CheckoutRequestSchema } from '../schemas';
import { runEffectEither } from '../runtime';
import { errorToResponse } from '../http';
import { createApiKey, CreateKeyBody } from '../keys';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// ───────────────────────────────────────────────────────────────────────────────
// POST /keys — create a new API key
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.post('/keys', async (c) => {
  const raw = await c.req.json().catch(() => ({}));

  const program = Effect.gen(function* () {
    const body = yield* Schema.decodeUnknown(CreateKeyBody)(raw).pipe(
      Effect.mapError(
        () =>
          new ValidationError({
            field: 'body',
            message: 'Invalid request body',
          }),
      ),
    );

    const apiKey = yield* createApiKey({
      name: body.name ?? body.client_name,
      redirectUris: body.redirect_uris,
    });

    return {
      client_id: apiKey.clientId,
      client_secret: apiKey.clientSecret,
      name: apiKey.name,
      credits: apiKey.credits,
      redirect_uris: apiKey.redirectUris ?? [],
    };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    c.header('Cache-Control', 'no-store');
    return c.json(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// ───────────────────────────────────────────────────────────────────────────────
// GET /keys/:clientId — get key info (requires X-Client-Secret)
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.get('/keys/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const clientSecret = c.req.header('X-Client-Secret');

  if (!clientSecret) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing X-Client-Secret header',
          action:
            'Include your client_secret in the X-Client-Secret request header',
          docs: 'https://inbox.dog/docs/errors#INVALID_CREDENTIALS',
        },
      },
      401,
    );
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;

    const apiKey = yield* kv.getApiKey(clientId);

    const secretMatch = yield* Effect.promise(() =>
      timingSafeEqual(apiKey.clientSecret, clientSecret),
    );
    if (!secretMatch) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Invalid credentials' }),
      );
    }

    return {
      client_id: apiKey.clientId,
      name: apiKey.name,
      credits: apiKey.credits,
      created_at: apiKey.createdAt,
    };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    return c.json(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// ───────────────────────────────────────────────────────────────────────────────
// DELETE /keys/:clientId — delete key (requires X-Client-Secret)
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.delete('/keys/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const clientSecret = c.req.header('X-Client-Secret');

  if (!clientSecret) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing X-Client-Secret header',
          action:
            'Include your client_secret in the X-Client-Secret request header',
          docs: 'https://inbox.dog/docs/errors#INVALID_CREDENTIALS',
        },
      },
      401,
    );
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;

    const apiKey = yield* kv.getApiKey(clientId);

    const secretMatch = yield* Effect.promise(() =>
      timingSafeEqual(apiKey.clientSecret, clientSecret),
    );
    if (!secretMatch) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Invalid credentials' }),
      );
    }

    yield* kv.deleteApiKey(clientId);

    return { deleted: true, client_id: clientId };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    return c.json(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// ───────────────────────────────────────────────────────────────────────────────
// POST /checkout — create a Stripe checkout session
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.post('/checkout', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const origin = new URL(c.req.url).origin;

  const program = Effect.gen(function* () {
    const body = yield* Schema.decodeUnknown(CheckoutRequestSchema)(raw).pipe(
      Effect.mapError(
        () =>
          new ValidationError({
            field: 'body',
            message:
              'Missing or invalid fields. Required: client_id, client_secret',
          }),
      ),
    );

    const kv = yield* KVService;
    const apiKey = yield* kv.getApiKey(body.client_id);

    const secretMatch = yield* Effect.promise(() =>
      timingSafeEqual(apiKey.clientSecret, body.client_secret),
    );
    if (!secretMatch) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Invalid credentials' }),
      );
    }

    const credits = body.credits ?? 100;
    const amount = credits * 10; // $0.10 per credit in cents

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            mode: 'payment',
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/checkout/cancel`,
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]':
              'OAuth Credits',
            'line_items[0][price_data][product_data][description]': `${credits} OAuth flow credits`,
            'line_items[0][price_data][unit_amount]': String(amount),
            'line_items[0][quantity]': '1',
            'metadata[client_id]': body.client_id,
            'metadata[credits]': String(credits),
          }),
        }),
      catch: () =>
        new StripeError({ message: 'Failed to reach Stripe API' }),
    });

    if (!response.ok) {
      console.error('Stripe checkout error: HTTP', response.status);
      return yield* Effect.fail(
        new StripeError({ message: 'Failed to create checkout session' }),
      );
    }

    const session = (yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ id: string; url: string }>,
      catch: () =>
        new StripeError({ message: 'Failed to parse Stripe response' }),
    }));

    return {
      checkout_url: session.url,
      session_id: session.id,
    };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    return c.json(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});
