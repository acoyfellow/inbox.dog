import { Hono } from 'hono';
import type { Env, ApiKey } from '../types';
import { generateId, generateSecret } from '../utils';

export const apiRoutes = new Hono<{ Bindings: Env }>();

// Create API key (for dashboard/admin use)
// POST /api/keys { name }
apiRoutes.post('/keys', async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name ?? 'default';

  const clientId = `id_${generateId()}`;
  const clientSecret = `sk_${generateSecret()}`;

  const apiKey: ApiKey = {
    id: generateId(),
    clientId,
    clientSecret,
    name,
    createdAt: Date.now(),
    credits: 10, // Start with 10 free credits
  };

  await c.env.KV.put(`apikey:${clientId}`, JSON.stringify(apiKey));

  return c.json({
    client_id: clientId,
    client_secret: clientSecret,
    name,
    credits: apiKey.credits,
  });
});

// Get API key info
// GET /api/keys/:clientId
apiRoutes.get('/keys/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const clientSecret = c.req.header('X-Client-Secret');

  if (!clientSecret) {
    return c.json({ error: 'Missing X-Client-Secret header' }, 401);
  }

  const apiKeyJson = await c.env.KV.get(`apikey:${clientId}`);
  if (!apiKeyJson) {
    return c.json({ error: 'Not found' }, 404);
  }

  const apiKey = JSON.parse(apiKeyJson) as ApiKey;
  if (apiKey.clientSecret !== clientSecret) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  return c.json({
    client_id: apiKey.clientId,
    name: apiKey.name,
    credits: apiKey.credits,
    created_at: apiKey.createdAt,
  });
});

// Create Stripe checkout session
// POST /api/checkout { client_id, client_secret, credits }
apiRoutes.post('/checkout', async (c) => {
  const body = await c.req.json<{
    client_id?: string;
    client_secret?: string;
    credits?: number;
  }>();

  const { client_id, client_secret, credits = 100 } = body;

  if (!client_id || !client_secret) {
    return c.json({ error: 'Missing credentials' }, 400);
  }

  // Validate credentials
  const apiKeyJson = await c.env.KV.get(`apikey:${client_id}`);
  if (!apiKeyJson) {
    return c.json({ error: 'Invalid client_id' }, 401);
  }

  const apiKey = JSON.parse(apiKeyJson) as ApiKey;
  if (apiKey.clientSecret !== client_secret) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Price: $0.10 per credit (10 cents)
  const amount = credits * 10; // in cents

  // Create Stripe checkout session
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'payment',
      'success_url': `${new URL(c.req.url).origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${new URL(c.req.url).origin}/checkout/cancel`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'OAuth Credits',
      'line_items[0][price_data][product_data][description]': `${credits} OAuth flow credits`,
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][quantity]': '1',
      'metadata[client_id]': client_id,
      'metadata[credits]': String(credits),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Stripe error:', error);
    return c.json({ error: 'Failed to create checkout session' }, 500);
  }

  const session = (await response.json()) as { id: string; url: string };

  return c.json({
    checkout_url: session.url,
    session_id: session.id,
  });
});
