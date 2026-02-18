import { Hono } from 'hono';
import { Effect } from 'effect';
import type { Env } from '../types';
import { authenticateApiKey } from '../auth';
import { runEffectEither } from '../runtime';
import { errorToResponse } from '../http';

export const deviceRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/device/code
 *
 * Device-code style auth for CLIs and agents that can't host a callback server.
 * Returns an auth URL that uses inbox.dog's hosted /connect/oauth page as the
 * redirect_uri. The user opens the URL, authenticates with Google, and copies
 * the resulting code back into the CLI.
 *
 * Request body:
 *   { client_id, client_secret, scope? }
 *
 * Response:
 *   { auth_url, redirect_uri, expires_in }
 */
deviceRoutes.post('/code', async (c) => {
  const body = await c.req.json<{
    client_id?: string;
    client_secret?: string;
    scope?: string;
  }>().catch(() => ({} as Record<string, undefined>));

  const { client_id, client_secret, scope } = body;

  if (!client_id || !client_secret) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: client_id and client_secret',
          action: 'Provide client_id and client_secret in the request body',
          docs: 'https://inbox.dog/docs/guides/device-auth',
        },
      },
      400,
    );
  }

  const program = Effect.gen(function* () {
    yield* authenticateApiKey(client_id, client_secret);

    // Build the auth URL with redirect_uri pointed at the hosted code display page
    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/connect/oauth`;
    const authUrl = new URL(`${origin}/oauth/authorize`);
    authUrl.searchParams.set('client_id', client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope ?? 'email');

    return {
      auth_url: authUrl.toString(),
      redirect_uri: redirectUri,
      expires_in: 600,
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
