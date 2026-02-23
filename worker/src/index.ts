import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { oauthRoutes } from './routes/oauth';
import { apiRoutes } from './routes/api';
import { deviceRoutes } from './routes/device';
import { webhookRoutes } from './routes/webhooks';
import { mcpRoutes } from './routes/mcp';
import { wellKnownRoutes } from './routes/well-known';
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
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});

// Block TRACE/TRACK methods (CASA Z-1 Proxy Disclosure)
app.use('*', async (c, next) => {
  if (c.req.method === 'TRACE' || c.req.method === 'TRACK') {
    c.status(405);
    return c.text('Method Not Allowed');
  }
  return next();
});

// CORS helper — parse ALLOWED_ORIGINS env; unset = allow all (backwards-compatible)
function corsOrigin(c: { env: Env }) {
  const raw = c.env.ALLOWED_ORIGINS ?? '';
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return '*';
  return (origin: string) => (allowed.includes(origin) ? origin : '');
}

// CORS for API + OAuth routes — origin-restricted
app.use('/api/*', async (c, next) => {
  const mw = cors({
    origin: corsOrigin(c),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Client-Secret', 'X-Client-ID'],
    maxAge: 86400,
  });
  return mw(c, next);
});
app.use('/oauth/*', async (c, next) => {
  const mw = cors({
    origin: corsOrigin(c),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  });
  return mw(c, next);
});
// MCP: server-to-server, keep open (auth is on the Bearer token)
app.use('/mcp', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposeHeaders: ['WWW-Authenticate'],
  maxAge: 86400,
}));
app.use('/mcp/*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposeHeaders: ['WWW-Authenticate'],
  maxAge: 86400,
}));
// .well-known: public metadata, must be open per spec
app.use('/.well-known/*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Rate limiting for sensitive endpoints (KV-based sliding window)
app.use('/oauth/register', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:register:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 10) {
    return c.json({ error: 'rate_limited', error_description: 'Too many registration requests. Max 10 per minute.' }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});
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
app.use('/api/connect/prepare', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:connect_prepare:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 20) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many connect requests. Max 20 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});
app.use('/api/connect/complete', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:connect_complete:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 20) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many connect requests. Max 20 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});
app.use('/api/device/code', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:device_code:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 10) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many device code requests. Max 10 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
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
app.use('/api/tokens', async (c, next) => {
  if (c.req.method !== 'GET') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:get_tokens:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 20) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many token requests. Max 20 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});
app.use('/mcp', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const key = `ratelimit:mcp:${ip}`;
  const current = parseInt(await c.env.KV.get(key) ?? '0', 10);
  if (current >= 60) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many MCP requests. Max 60 per minute.', action: 'Wait before retrying', docs: 'https://inbox.dog/docs/errors' } }, 429);
  }
  await c.env.KV.put(key, String(current + 1), { expirationTtl: 60 });
  return next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount routes
app.route('/.well-known', wellKnownRoutes);
app.route('/oauth', oauthRoutes);
app.route('/api', apiRoutes);
app.route('/api/device', deviceRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/mcp', mcpRoutes);

// For any route not handled above, fall through to assets
// The assets binding handles static files automatically
// This is the fallback for 404s from the API
app.notFound((c) => {
  // Return JSON 404 for API-like routes
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/') || path.startsWith('/oauth/') || path.startsWith('/webhooks/') || path.startsWith('/mcp') || path.startsWith('/.well-known/')) {
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
