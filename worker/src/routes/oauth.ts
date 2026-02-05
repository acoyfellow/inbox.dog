import { Hono } from 'hono';
import { Effect, pipe, Layer, ManagedRuntime } from 'effect';
import type { Env } from '../types';
import { GoogleOAuthService, GoogleOAuthServiceLive } from '../services/google';
import { KVService, KVServiceLive } from '../services/kv';
import { generateId } from '../utils';
import {
  InvalidCredentialsError,
  InsufficientCreditsError,
  NotFoundError,
  StateError,
  ValidationError,
  TokenExchangeError,
  type AppError,
} from '../errors';
import type { OAuthState, ApiKey } from '../schemas';

export const oauthRoutes = new Hono<{ Bindings: Env }>();

// Helper to run Effect with services and handle errors
const runWithServices = async <A, E>(
  effect: Effect.Effect<A, E, GoogleOAuthService | KVService>,
  env: Env
): Promise<{ ok: true; value: A } | { ok: false; error: E }> => {
  const layer = Layer.mergeAll(GoogleOAuthServiceLive, KVServiceLive(env.KV));
  const runtime = ManagedRuntime.make(layer);
  const result = await runtime.runPromise(
    Effect.either(effect)
  );
  if (result._tag === 'Right') {
    return { ok: true, value: result.right };
  }
  return { ok: false, error: result.left };
};

// Map errors to HTTP responses
const errorToResponse = (error: unknown): { status: number; body: { error: string; details?: string } } => {
  if (error instanceof InvalidCredentialsError) {
    return { status: 401, body: { error: error.message } };
  }
  if (error instanceof InsufficientCreditsError) {
    return { status: 402, body: { error: `Insufficient credits. Current: ${error.credits}` } };
  }
  if (error instanceof NotFoundError) {
    return { status: 400, body: { error: `${error.resource} not found` } };
  }
  if (error instanceof StateError) {
    return { status: 400, body: { error: error.message } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: { error: `${error.field}: ${error.message}` } };
  }
  if (error instanceof TokenExchangeError) {
    return { status: 500, body: { error: error.message, details: error.details } };
  }
  return { status: 500, body: { error: 'Internal server error' } };
};

// GET /oauth/authorize
oauthRoutes.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'email';

  if (!clientId || !redirectUri) {
    return c.json({ error: 'Missing client_id or redirect_uri' }, 400);
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;
    const google = yield* GoogleOAuthService;

    // Validate client exists
    yield* kv.getApiKey(clientId);

    // Store OAuth state
    const oauthStateId = generateId();
    const oauthState: OAuthState = {
      clientId,
      redirectUri,
      scope,
      state,
      createdAt: Date.now(),
    };
    yield* kv.putOAuthState(oauthStateId, oauthState, 600);

    // Build Google auth URL
    return google.buildAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: `${new URL(c.req.url).origin}/oauth/callback`,
      state: oauthStateId,
      scope: mapScope(scope),
    });
  });

  const result = await runWithServices(program, c.env);
  if (result.ok) {
    return c.redirect(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as 400 | 401 | 500);
});

// GET /oauth/callback
oauthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const stateId = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.json({ error: `OAuth error: ${error}` }, 400);
  }

  if (!code || !stateId) {
    return c.json({ error: 'Missing code or state' }, 400);
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;
    const google = yield* GoogleOAuthService;

    // Get and validate state
    const oauthState = yield* kv.getOAuthState(stateId);
    yield* kv.deleteOAuthState(stateId);

    // Exchange code with Google
    const tokens = yield* google.exchangeCode({
      code,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${new URL(c.req.url).origin}/oauth/callback`,
    });

    // Store auth code
    const authCode = generateId();
    yield* kv.putAuthCode(
      authCode,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        email: tokens.email,
        clientId: oauthState.clientId,
      },
      300
    );

    // Build redirect URL
    const redirectUrl = new URL(oauthState.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    if (oauthState.state) {
      redirectUrl.searchParams.set('state', oauthState.state);
    }
    return redirectUrl.toString();
  });

  const result = await runWithServices(program, c.env);
  if (result.ok) {
    return c.redirect(result.value);
  }
  console.error('OAuth callback error:', result.error);
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as 400 | 401 | 500);
});

// POST /oauth/token
oauthRoutes.post('/token', async (c) => {
  const body = await c.req.json<{
    code?: string;
    client_id?: string;
    client_secret?: string;
    grant_type?: string;
    refresh_token?: string;
  }>();

  const grantType = body.grant_type ?? 'authorization_code';

  if (grantType === 'refresh_token') {
    return handleRefreshToken(c, body);
  }

  const { code, client_id, client_secret } = body;

  if (!code || !client_id || !client_secret) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;

    // Validate credentials and get API key
    const apiKey = yield* kv.getApiKey(client_id);

    if (apiKey.clientSecret !== client_secret) {
      return yield* Effect.fail(new InvalidCredentialsError({ message: 'Invalid client_secret' }));
    }

    if (apiKey.credits <= 0) {
      return yield* Effect.fail(new InsufficientCreditsError({ clientId: client_id, credits: apiKey.credits }));
    }

    // Get auth code data
    const authData = yield* kv.getAuthCode(code);

    if (authData.clientId !== client_id) {
      return yield* Effect.fail(new InvalidCredentialsError({ message: 'Code was not issued to this client' }));
    }

    yield* kv.deleteAuthCode(code);

    // Deduct credit
    const updatedApiKey: ApiKey = { ...apiKey, credits: apiKey.credits - 1 };
    yield* kv.putApiKey(client_id, updatedApiKey);

    return {
      access_token: authData.accessToken,
      refresh_token: authData.refreshToken,
      token_type: 'Bearer',
      expires_in: authData.expiresIn,
      email: authData.email,
    };
  });

  const result = await runWithServices(program, c.env);
  if (result.ok) {
    return c.json(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as 400 | 401 | 402 | 500);
});

async function handleRefreshToken(
  c: { env: Env; json: (data: unknown, status?: number) => Response },
  body: { refresh_token?: string; client_id?: string; client_secret?: string }
) {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token || !client_id || !client_secret) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;
    const google = yield* GoogleOAuthService;

    // Validate credentials
    const apiKey = yield* kv.getApiKey(client_id);

    if (apiKey.clientSecret !== client_secret) {
      return yield* Effect.fail(new InvalidCredentialsError({ message: 'Invalid credentials' }));
    }

    // Refresh with Google
    const result = yield* google.refreshToken({
      refreshToken: refresh_token,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    });

    return {
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
    };
  });

  const result = await runWithServices(program, c.env);
  if (result.ok) {
    return c.json(result.value);
  }
  const { status, body: errorBody } = errorToResponse(result.error);
  return c.json(errorBody, status as 400 | 401 | 500);
}

function mapScope(scope: string): string {
  const scopes: Record<string, string> = {
    email: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    'email:read': 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    'email:send': 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    'email:full': 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
  };
  return scopes[scope] ?? scopes['email']!;
}
