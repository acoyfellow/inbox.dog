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

  // Verify webhook signature (includes timestamp validation)
  const verification = await verifyStripeSignature(
    body,
    signature,
    c.env.STRIPE_WEBHOOK_SECRET
  );

  if (!verification.valid) {
    return c.json({ error: verification.reason ?? 'Invalid signature' }, 401);
  }

  const event = JSON.parse(body) as {
    id: string;
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

    // Idempotency: check if this session was already processed
    const idempotencyKey = `webhook_processed:${session.id}`;
    const alreadyProcessed = await c.env.KV.get(idempotencyKey);
    if (alreadyProcessed) {
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
      }
    }

    // Mark as processed (keep for 24 hours to handle retries)
    await c.env.KV.put(idempotencyKey, '1', { expirationTtl: 86400 });
  }

  return c.json({ received: true });
});

const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  const parts = signature.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigPart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !sigPart) {
    return { valid: false, reason: 'Malformed signature header' };
  }

  const timestamp = timestampPart.slice(2);
  const sig = sigPart.slice(3);

  // Validate timestamp is within tolerance (prevent replay attacks)
  const eventTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - eventTime) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'Timestamp outside tolerance window' };
  }

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

  // Timing-safe comparison of HMAC signatures
  const encoder = new TextEncoder();
  const expectedBuf = encoder.encode(expectedHex);
  const sigBuf = encoder.encode(sig);
  if (expectedBuf.byteLength !== sigBuf.byteLength) {
    return { valid: false, reason: 'Signature length mismatch' };
  }
  const compareKey = await crypto.subtle.importKey('raw', encoder.encode('hmac-compare'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedMac = new Uint8Array(await crypto.subtle.sign('HMAC', compareKey, expectedBuf));
  const sigMac = new Uint8Array(await crypto.subtle.sign('HMAC', compareKey, sigBuf));
  let diff = 0;
  for (let i = 0; i < expectedMac.length; i++) {
    diff |= expectedMac[i]! ^ sigMac[i]!;
  }
  return diff === 0 ? { valid: true } : { valid: false, reason: 'Invalid signature' };
}
