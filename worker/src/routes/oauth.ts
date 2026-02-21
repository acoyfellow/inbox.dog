import { Hono } from 'hono';
import { Effect, Schema } from 'effect';
import type { Env } from '../types';
import { GoogleOAuthService } from '../services/google';
import { KVService } from '../services/kv';
import { generateId, timingSafeEqual } from '../utils';
import { authenticateApiKey } from '../auth';
import {
  InvalidCredentialsError,
  ValidationError,
} from '../errors';
import type { OAuthState, ApiKey } from '../schemas';
import { runEffectEither } from '../runtime';
import { errorToResponse } from '../http';
import { createApiKey, CreateKeyBody } from '../keys';

export const oauthRoutes = new Hono<{ Bindings: Env }>();

// ── Dynamic Client Registration (RFC 7591) ──────────────────────────────────
// MCP clients call this to register themselves and get client credentials.
oauthRoutes.post('/register', async (c) => {
  const raw = await c.req.json().catch(() => ({}));

  const program = Effect.gen(function* () {
    const body = yield* Schema.decodeUnknown(CreateKeyBody)(raw).pipe(
      Effect.mapError(
        () => new ValidationError({ field: 'body', message: 'Invalid registration request body' }),
      ),
    );

    const name = body.client_name ?? body.name ?? 'mcp-client';
    const redirectUris = body.redirect_uris ?? [];

    const apiKey = yield* createApiKey({ name, redirectUris });

    return {
      client_id: apiKey.clientId,
      client_secret: apiKey.clientSecret,
      client_name: apiKey.name,
      redirect_uris: apiKey.redirectUris ?? [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    c.header('Cache-Control', 'no-store');
    return c.json(result.value, 201);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// GET /oauth/authorize
oauthRoutes.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'email';
  const prompt = c.req.query('prompt');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');

  if (!clientId || !redirectUri) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing client_id or redirect_uri',
          action: 'Provide both client_id and redirect_uri query parameters',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      400,
    );
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;
    const google = yield* GoogleOAuthService;

    // Validate client exists and check redirect_uri allowlist
    const apiKey = yield* kv.getApiKey(clientId);
    if (apiKey.redirectUris && apiKey.redirectUris.length > 0) {
      const normalizedRedirect =
        new URL(redirectUri).origin + new URL(redirectUri).pathname;
      const allowed = apiKey.redirectUris.some((uri) => {
        const normalizedAllowed = new URL(uri).origin + new URL(uri).pathname;
        return normalizedRedirect === normalizedAllowed;
      });
      if (!allowed) {
        return yield* Effect.fail(
          new ValidationError({
            field: 'redirect_uri',
            message:
              'redirect_uri not in allowlist. Register URIs when creating your API key.',
          }),
        );
      }
    }

    // Store OAuth state
    const oauthStateId = generateId();
    const oauthState: OAuthState = {
      clientId,
      redirectUri,
      scope,
      state,
      createdAt: Date.now(),
      ...(codeChallenge
        ? {
            codeChallenge,
            codeChallengeMethod: codeChallengeMethod ?? 'S256',
          }
        : {}),
    };
    yield* kv.putOAuthState(oauthStateId, oauthState, 600);

    // Build Google auth URL
    return google.buildAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: `${new URL(c.req.url).origin}/oauth/callback`,
      state: oauthStateId,
      scope: mapScope(scope),
      prompt,
    });
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    return c.redirect(result.value);
  }
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// GET /oauth/callback
oauthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const stateId = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.json(
      {
        error: {
          code: 'OAUTH_ERROR',
          message: `OAuth error: ${error}`,
          action: 'User may have denied consent. Restart the OAuth flow.',
          docs: 'https://inbox.dog/docs/errors',
        },
      },
      400,
    );
  }

  if (!code || !stateId) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing code or state',
          action:
            'This endpoint is called automatically during the OAuth callback',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      400,
    );
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

    // Store auth code (include PKCE challenge if present)
    const authCode = generateId();
    yield* kv.putAuthCode(
      authCode,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        email: tokens.email,
        clientId: oauthState.clientId,
        ...(oauthState.codeChallenge
          ? {
              codeChallenge: oauthState.codeChallenge,
              codeChallengeMethod: oauthState.codeChallengeMethod,
            }
          : {}),
      },
      300,
    );

    // Build redirect URL
    const redirectUrl = new URL(oauthState.redirectUri);
    redirectUrl.searchParams.set('code', authCode);
    if (oauthState.state) {
      redirectUrl.searchParams.set('state', oauthState.state);
    }
    return redirectUrl.toString();
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    return c.redirect(result.value);
  }
  const errTag =
    result.error instanceof Error ? result.error.constructor.name : 'UnknownError';
  console.error('OAuth callback error:', errTag);
  const { status, body: errBody } = errorToResponse(result.error);
  return c.json(errBody, status as any);
});

// POST /oauth/token
// Accepts both application/json and application/x-www-form-urlencoded (OAuth 2.1 spec)
oauthRoutes.post('/token', async (c) => {
  let body: {
    code?: string;
    client_id?: string;
    client_secret?: string;
    grant_type?: string;
    refresh_token?: string;
    code_verifier?: string;
  };

  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.parseBody();
    body = {
      code: formData['code'] as string | undefined,
      client_id: formData['client_id'] as string | undefined,
      client_secret: formData['client_secret'] as string | undefined,
      grant_type: formData['grant_type'] as string | undefined,
      refresh_token: formData['refresh_token'] as string | undefined,
      code_verifier: formData['code_verifier'] as string | undefined,
    };
  } else {
    body = await c.req.json();
  }

  const grantType = body.grant_type ?? 'authorization_code';

  if (grantType === 'refresh_token') {
    return handleRefreshToken(c, body);
  }

  const { code, client_id, client_secret, code_verifier } = body;

  if (!code || !client_id) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: code and client_id are required',
          action:
            'Provide code (from OAuth callback) and client_id in the request body',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      400,
    );
  }

  // Either client_secret or code_verifier (PKCE) must be present
  if (!client_secret && !code_verifier) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Either client_secret or code_verifier (PKCE) is required',
          action:
            'Provide client_secret for confidential clients or code_verifier for public clients (PKCE)',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      400,
    );
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;

    // Validate credentials: client_secret OR PKCE (verified later)
    const apiKey = client_secret
      ? yield* authenticateApiKey(client_id, client_secret)
      : yield* kv.getApiKey(client_id);

    // Get auth code data
    const authData = yield* kv.getAuthCode(code);

    if (authData.clientId !== client_id) {
      return yield* Effect.fail(
        new InvalidCredentialsError({
          message: 'Code was not issued to this client',
        }),
      );
    }

    // PKCE verification
    if (authData.codeChallenge) {
      if (!code_verifier) {
        return yield* Effect.fail(
          new ValidationError({
            field: 'code_verifier',
            message: 'PKCE code_verifier required for this authorization',
          }),
        );
      }
      const verified = yield* Effect.promise(async () => {
        const encoder = new TextEncoder();
        const digest = await crypto.subtle.digest(
          'SHA-256',
          encoder.encode(code_verifier),
        );
        const arr = new Uint8Array(digest);
        let str = '';
        for (const byte of arr) str += String.fromCharCode(byte);
        const computed = btoa(str)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        return computed === authData.codeChallenge;
      });
      if (!verified) {
        return yield* Effect.fail(
          new InvalidCredentialsError({
            message: 'PKCE code_verifier does not match code_challenge',
          }),
        );
      }
    } else if (!client_secret) {
      // No PKCE and no client_secret — reject
      return yield* Effect.fail(
        new InvalidCredentialsError({
          message: 'client_secret required (no PKCE challenge was set)',
        }),
      );
    }

    yield* kv.deleteAuthCode(code);

    // If PKCE was used (MCP flow), create a session token that wraps Gmail tokens.
    if (code_verifier) {
      const sessionToken = `mcp_${generateId()}`;
      yield* kv.putMcpSession(
        sessionToken,
        {
          accessToken: authData.accessToken,
          refreshToken: authData.refreshToken,
          expiresAt: Date.now() + authData.expiresIn * 1000,
          email: authData.email,
          clientId: client_id,
        },
        90 * 24 * 60 * 60, // 90 days
      );
      return {
        access_token: sessionToken,
        token_type: 'Bearer' as const,
        expires_in: 90 * 24 * 60 * 60,
        scope: 'gmail:read gmail:send',
      };
    }

    // Non-PKCE (legacy REST API flow) — return raw Gmail tokens
    return {
      access_token: authData.accessToken,
      refresh_token: authData.refreshToken,
      token_type: 'Bearer' as const,
      expires_in: authData.expiresIn,
      email: authData.email,
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

async function handleRefreshToken(
  c: {
    env: Env;
    json: (data: unknown, status?: number) => Response;
    header: (name: string, value: string) => void;
  },
  body: {
    refresh_token?: string;
    client_id?: string;
    client_secret?: string;
  },
) {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token || !client_id || !client_secret) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Missing required fields: refresh_token, client_id, and client_secret are required',
          action:
            'Provide refresh_token, client_id, and client_secret in the request body with grant_type=refresh_token',
          docs: 'https://inbox.dog/docs/api',
        },
      },
      400,
    );
  }

  const program = Effect.gen(function* () {
    const kv = yield* KVService;
    const google = yield* GoogleOAuthService;

    // Validate credentials
    const apiKey = yield* kv.getApiKey(client_id);

    const refreshSecretMatch = yield* Effect.promise(() =>
      timingSafeEqual(apiKey.clientSecret, client_secret),
    );
    if (!refreshSecretMatch) {
      return yield* Effect.fail(
        new InvalidCredentialsError({ message: 'Invalid credentials' }),
      );
    }

    // Refresh with Google
    const result = yield* google.refreshToken({
      refreshToken: refresh_token,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    });

    return {
      access_token: result.accessToken,
      token_type: 'Bearer' as const,
      expires_in: result.expiresIn,
    };
  });

  const result = await runEffectEither(program, c.env);
  if (result.ok) {
    c.header('Cache-Control', 'no-store');
    return c.json(result.value);
  }
  const { status, body: errorBody } = errorToResponse(result.error);
  return c.json(errorBody, status as any);
}

function mapScope(scope: string): string {
  const scopes: Record<string, string> = {
    email:
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    'email:read':
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    'email:send':
      'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    'email:full':
      'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
    'gmail:read':
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    'gmail:send':
      'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    'gmail:full':
      'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
  };
  return scopes[scope] ?? scopes['email']!;
}

// POST /oauth/revoke (RFC 7009)
oauthRoutes.post('/revoke', async (c) => {
  let token: string | undefined;

  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.parseBody();
    token = formData['token'] as string | undefined;
  } else {
    const body = await c.req
      .json<{ token?: string }>()
      .catch(() => ({}) as { token?: string });
    token = body.token;
  }

  if (!token) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'Missing token parameter',
      },
      400,
    );
  }

  // Delete the MCP session
  await c.env.KV.delete(`mcp_session:${token}`);

  // RFC 7009: always return 200, even if token didn't exist
  return c.json({ revoked: true });
});
