/**
 * Stripe Webhook E2E Test
 * Simulates the complete payment flow with webhook signature
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

const BASE_URL = process.env.TEST_URL || 'https://inbox.dog';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_MibD1H0hAq7hYzqYLWkMoQQkgFnDsTOk';

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Stripe Webhook Integration', () => {
  it('should add credits when checkout.session.completed fires', async () => {
    // 1. Create an API key
    const keyRes = await fetch(`${BASE_URL}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'webhook-test' }),
    });
    const keyData = await keyRes.json();
    const { client_id, client_secret } = keyData;
    
    console.log(`  Created key: ${client_id}`);
    console.log(`  Initial credits: ${keyData.credits}`);
    assert.strictEqual(keyData.credits, 10);

    // 2. Simulate Stripe webhook payload
    const webhookPayload = JSON.stringify({
      id: 'evt_test_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_' + Date.now(),
          payment_status: 'paid',
          metadata: {
            client_id: client_id,
            credits: '50',
          },
        },
      },
    });

    // 3. Generate valid signature
    const signature = generateStripeSignature(webhookPayload, WEBHOOK_SECRET);

    // 4. Send webhook
    const webhookRes = await fetch(`${BASE_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: webhookPayload,
    });

    console.log(`  Webhook response: ${webhookRes.status}`);
    assert.strictEqual(webhookRes.status, 200);
    
    const webhookData = await webhookRes.json();
    assert.strictEqual(webhookData.received, true);

    // 5. Verify credits were added
    const checkRes = await fetch(`${BASE_URL}/api/keys/${client_id}`, {
      headers: { 'X-Client-Secret': client_secret },
    });
    const checkData = await checkRes.json();
    
    console.log(`  Final credits: ${checkData.credits}`);
    assert.strictEqual(checkData.credits, 60, 'Should have 10 + 50 = 60 credits');
  });

  it('should ignore unpaid checkout sessions', async () => {
    // Create key
    const keyRes = await fetch(`${BASE_URL}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'unpaid-test' }),
    });
    const { client_id, client_secret } = await keyRes.json();

    // Webhook with unpaid status
    const webhookPayload = JSON.stringify({
      id: 'evt_test_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_' + Date.now(),
          payment_status: 'unpaid', // Not paid!
          metadata: {
            client_id: client_id,
            credits: '100',
          },
        },
      },
    });

    const signature = generateStripeSignature(webhookPayload, WEBHOOK_SECRET);
    
    await fetch(`${BASE_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: webhookPayload,
    });

    // Credits should NOT be added
    const checkRes = await fetch(`${BASE_URL}/api/keys/${client_id}`, {
      headers: { 'X-Client-Secret': client_secret },
    });
    const checkData = await checkRes.json();
    
    assert.strictEqual(checkData.credits, 10, 'Credits should remain at 10');
  });

  it('should handle missing metadata gracefully', async () => {
    const webhookPayload = JSON.stringify({
      id: 'evt_test_' + Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_' + Date.now(),
          payment_status: 'paid',
          // No metadata!
        },
      },
    });

    const signature = generateStripeSignature(webhookPayload, WEBHOOK_SECRET);
    
    const res = await fetch(`${BASE_URL}/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: webhookPayload,
    });

    assert.strictEqual(res.status, 200); // Should not error
    const data = await res.json();
    assert.strictEqual(data.received, true);
  });
});
