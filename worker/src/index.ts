import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Effect, pipe } from 'effect';
import { oauthRoutes } from './routes/oauth';
import { apiRoutes } from './routes/api';
import { webhookRoutes } from './routes/webhooks';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Security headers on all responses (CASA Z-2, Z-3, Z-5)
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
});

// Block TRACE/TRACK methods (CASA Z-1 Proxy Disclosure)
app.use('*', async (c, next) => {
  if (c.req.method === 'TRACE' || c.req.method === 'TRACK') {
    c.status(405);
    return c.text('Method Not Allowed');
  }
  return next();
});

// CORS for API routes — explicit methods and headers
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Client-Secret'],
  maxAge: 86400,
}));
app.use('/oauth/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Rate limiting for sensitive endpoints (KV-based sliding window)
app.use('/api/keys', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:create_key:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 5) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many key creation requests. Max 5 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});
app.use('/oauth/token', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:token:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 20) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many token requests. Max 20 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount routes
app.route('/oauth', oauthRoutes);
app.route('/api', apiRoutes);
app.route('/webhooks', webhookRoutes);

// For any route not handled above, fall through to assets
// The assets binding handles static files automatically
// This is the fallback for 404s from the API
app.notFound((c) => {
  // Return JSON 404 for API-like routes
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/oauth/') || path.startsWith('/webhooks/')) {
    return c.json({ error: { code: 'NOT_FOUND', message: `Endpoint not found: ${path}`, action: 'Check the endpoint URL', docs: 'https://inbox.dog/docs/api' } }, 404);
  }
  // For other routes, let the assets binding handle it
  // If we reach here, it means assets didn't match either
  return c.json({ error: { code: 'NOT_FOUND', message: 'Not found', action: 'Check the URL', docs: 'https://inbox.dog/docs' } }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err instanceof Error ? err.message : 'Unknown error');
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error', action: 'Retry the request. If the problem persists, check https://inbox.dog/health', docs: 'https://inbox.dog/docs/errors' } }, 500);
});

export default app;
