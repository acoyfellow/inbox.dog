import { Hono } from 'hono';
import type { Env, ApiKey } from '../types';

export const webhookRoutes = new Hono<{ Bindings: Env }>();

// Stripe webhook
// POST /webhooks/stripe
webhookRoutes.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 400);
  }

  const body = await c.req.text();

  // Verify webhook signature
  const isValid = await verifyStripeSignature(
    body,
    signature,
    c.env.STRIPE_WEBHOOK_SECRET
  );

  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body) as {
    type: string;
    data: {
      object: {
        id: string;
        metadata?: { client_id?: string; credits?: string };
        payment_status?: string;
      };
    };
  };

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    if (session.payment_status !== 'paid') {
      return c.json({ received: true });
    }

    const clientId = session.metadata?.client_id;
    const credits = parseInt(session.metadata?.credits ?? '0', 10);

    if (clientId && credits > 0) {
      // Add credits to account
      const apiKeyJson = await c.env.KV.get(`apikey:${clientId}`);
      if (apiKeyJson) {
        const apiKey = JSON.parse(apiKeyJson) as ApiKey;
        apiKey.credits += credits;
        await c.env.KV.put(`apikey:${clientId}`, JSON.stringify(apiKey));
        console.log(`Added ${credits} credits to ${clientId}`);
      }
    }
  }

  return c.json({ received: true });
});

// Simple signature verification (in production, use stripe-js library)
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigPart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !sigPart) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const sig = sigPart.slice(3);

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const expectedSig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  );

  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return expectedHex === sig;
}
