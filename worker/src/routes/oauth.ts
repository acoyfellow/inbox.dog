import { Hono } from 'hono';
import { Effect, pipe } from 'effect';
import type { Env, OAuthState } from '../types';
import { GoogleOAuth } from '../services/google';
import { generateId, runEffect } from '../utils';

export const oauthRoutes = new Hono<{ Bindings: Env }>();

// OAuth authorization endpoint
// GET /oauth/authorize?client_id=xxx&redirect_uri=xxx&state=xxx&scope=xxx
oauthRoutes.get('/authorize', async (c) => {
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'email';

  if (!clientId || !redirectUri) {
    return c.json({ error: 'Missing client_id or redirect_uri' }, 400);
  }

  // Validate client_id exists
  const apiKey = await c.env.KV.get(`apikey:${clientId}`, 'json');
  if (!apiKey) {
    return c.json({ error: 'Invalid client_id' }, 400);
  }

  // Store OAuth state
  const oauthStateId = generateId();
  const oauthState: OAuthState = {
    clientId,
    redirectUri,
    scope,
    state,
    createdAt: Date.now(),
  };
  await c.env.KV.put(`oauth_state:${oauthStateId}`, JSON.stringify(oauthState), {
    expirationTtl: 600, // 10 minutes
  });

  // Build Google OAuth URL
  const googleAuthUrl = GoogleOAuth.buildAuthUrl({
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: `${new URL(c.req.url).origin}/oauth/callback`,
    state: oauthStateId,
    scope: mapScope(scope),
  });

  return c.redirect(googleAuthUrl);
});

// OAuth callback from Google
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

  // Retrieve and validate state
  const stateJson = await c.env.KV.get(`oauth_state:${stateId}`);
  if (!stateJson) {
    return c.json({ error: 'Invalid or expired state' }, 400);
  }

  const oauthState = JSON.parse(stateJson) as OAuthState;
  await c.env.KV.delete(`oauth_state:${stateId}`);

  // Exchange code for tokens with Google
  const result = await runEffect(
    GoogleOAuth.exchangeCode({
      code,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${new URL(c.req.url).origin}/oauth/callback`,
    })
  );

  if (result._tag === 'Left') {
    return c.json({ error: 'Failed to exchange code', details: result.left }, 500);
  }

  const tokens = result.right;

  // Generate our own authorization code
  const authCode = generateId();
  await c.env.KV.put(
    `auth_code:${authCode}`,
    JSON.stringify({
      ...tokens,
      clientId: oauthState.clientId,
    }),
    { expirationTtl: 300 } // 5 minutes
  );

  // Redirect back to client with code
  const redirectUrl = new URL(oauthState.redirectUri);
  redirectUrl.searchParams.set('code', authCode);
  if (oauthState.state) {
    redirectUrl.searchParams.set('state', oauthState.state);
  }

  return c.redirect(redirectUrl.toString());
});

// Token exchange endpoint
// POST /oauth/token { code, client_id, client_secret }
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

  // Validate client credentials
  const apiKeyJson = await c.env.KV.get(`apikey:${client_id}`);
  if (!apiKeyJson) {
    return c.json({ error: 'Invalid client_id' }, 401);
  }

  const apiKey = JSON.parse(apiKeyJson) as { clientSecret: string; credits: number };
  if (apiKey.clientSecret !== client_secret) {
    return c.json({ error: 'Invalid client_secret' }, 401);
  }

  // Check credits
  if (apiKey.credits <= 0) {
    return c.json({ error: 'Insufficient credits' }, 402);
  }

  // Retrieve auth code data
  const authCodeJson = await c.env.KV.get(`auth_code:${code}`);
  if (!authCodeJson) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const authData = JSON.parse(authCodeJson) as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    email: string;
    clientId: string;
  };

  // Verify client_id matches
  if (authData.clientId !== client_id) {
    return c.json({ error: 'Code was not issued to this client' }, 401);
  }

  // Delete used auth code
  await c.env.KV.delete(`auth_code:${code}`);

  // Deduct credit
  apiKey.credits -= 1;
  await c.env.KV.put(`apikey:${client_id}`, JSON.stringify({ ...JSON.parse(apiKeyJson), credits: apiKey.credits }));

  // Return tokens
  return c.json({
    access_token: authData.accessToken,
    refresh_token: authData.refreshToken,
    token_type: 'Bearer',
    expires_in: authData.expiresIn,
    email: authData.email,
  });
});

async function handleRefreshToken(
  c: { env: Env; json: (data: unknown, status?: number) => Response; req: { json: <T>() => Promise<T> } },
  body: { refresh_token?: string; client_id?: string; client_secret?: string }
) {
  const { refresh_token, client_id, client_secret } = body;

  if (!refresh_token || !client_id || !client_secret) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Validate client
  const apiKeyJson = await c.env.KV.get(`apikey:${client_id}`);
  if (!apiKeyJson) {
    return c.json({ error: 'Invalid client_id' }, 401);
  }

  const apiKey = JSON.parse(apiKeyJson) as { clientSecret: string };
  if (apiKey.clientSecret !== client_secret) {
    return c.json({ error: 'Invalid client_secret' }, 401);
  }

  // Refresh with Google
  const result = await runEffect(
    GoogleOAuth.refreshToken({
      refreshToken: refresh_token,
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    })
  );

  if (result._tag === 'Left') {
    return c.json({ error: 'Failed to refresh token', details: result.left }, 500);
  }

  return c.json({
    access_token: result.right.accessToken,
    token_type: 'Bearer',
    expires_in: result.right.expiresIn,
  });
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
