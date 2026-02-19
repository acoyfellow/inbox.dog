import { Hono } from 'hono';
import { Effect, Schema } from 'effect';
import type { Env } from '../types';
import { KVService } from '../services/kv';
import { authenticateApiKey } from '../auth';
import { ValidationError, InvalidCredentialsError } from '../errors';
import { runEffectEither } from '../runtime';
import { errorToResponse } from '../http';
import { createApiKey, CreateKeyBody } from '../keys';
import { generateId } from '../utils';

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
    const apiKey = yield* authenticateApiKey(clientId, clientSecret);

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
    const apiKey = yield* authenticateApiKey(clientId, clientSecret);

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
// GET /tokens — fetch Gmail tokens for web-bound API key (no OAuth in your app)
// Auth via X-Client-Secret header. Returns tokens stored at Connect Gmail.
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.get('/tokens', async (c) => {
  const clientId = c.req.query('client_id') ?? c.req.header('X-Client-ID');
  const clientSecret = c.req.header('X-Client-Secret');

  if (!clientId || !clientSecret) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing client_id and client_secret',
          action: 'Provide client_id (query or X-Client-ID header) and X-Client-Secret header',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      401,
    );
  }

  const program = Effect.gen(function* () {
    yield* authenticateApiKey(clientId, clientSecret);
    const kv = yield* KVService;
    const tokens = yield* kv.getGmailTokens(clientId);
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      email: tokens.email,
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
// POST /connect/prepare — create bind session for web Connect Gmail flow
// ───────────────────────────────────────────────────────────────────────────────
const ConnectPrepareBody = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
});

apiRoutes.post('/connect/prepare', async (c) => {
  const raw = await c.req.json().catch(() => ({}));

  const program = Effect.gen(function* () {
    const body = yield* Schema.decodeUnknown(ConnectPrepareBody)(raw).pipe(
      Effect.mapError(
        () =>
          new ValidationError({
            field: 'body',
            message: 'Invalid request. Provide client_id and client_secret.',
          }),
      ),
    );

    yield* authenticateApiKey(body.client_id, body.client_secret);

    const kv = yield* KVService;
    const bindToken = generateId();
    yield* kv.putBindSession(
      bindToken,
      { clientId: body.client_id, clientSecret: body.client_secret },
      600,
    );

    return { state: bindToken };
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
// POST /connect/complete — exchange auth code and store Gmail tokens (web bind)
// ───────────────────────────────────────────────────────────────────────────────
const ConnectCompleteBody = Schema.Struct({
  code: Schema.String,
  state: Schema.String,
});

apiRoutes.post('/connect/complete', async (c) => {
  const raw = await c.req.json().catch(() => ({}));

  const program = Effect.gen(function* () {
    const body = yield* Schema.decodeUnknown(ConnectCompleteBody)(raw).pipe(
      Effect.mapError(
        () =>
          new ValidationError({
            field: 'body',
            message: 'Invalid request. Provide code and state.',
          }),
      ),
    );

    const kv = yield* KVService;
    const bind = yield* kv.getBindSession(body.state);
    yield* kv.deleteBindSession(body.state);

    const authData = yield* kv.getAuthCode(body.code);
    if (authData.clientId !== bind.clientId) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Code was not issued to this client' }),
      );
    }
    yield* kv.deleteAuthCode(body.code);

    yield* kv.putGmailTokens(bind.clientId, {
      accessToken: authData.accessToken,
      refreshToken: authData.refreshToken,
      expiresAt: Date.now() + authData.expiresIn * 1000,
      email: authData.email,
    });

    return { success: true, email: authData.email };
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
// POST /checkout — temporarily unavailable (was Stripe checkout)
// ───────────────────────────────────────────────────────────────────────────────
apiRoutes.post('/checkout', async (c) => {
  return c.json(
    {
      error: {
        code: 'CHECKOUT_UNAVAILABLE',
        message: 'Checkout temporarily unavailable',
        action: 'Credits are not enforced. Use inbox.dog freely.',
        docs: 'https://inbox.dog/docs',
      },
    },
    410
  );
});
