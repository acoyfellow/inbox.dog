import { describe, it, before } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

let clientId;
let clientSecret;

describe('inbox.dog OAuth API', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.service, 'inbox.dog-oauth');
    });
  });

  describe('API Keys', () => {
    it('should create an API key', async () => {
      const res = await fetch(`${BASE_URL}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test-app' }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.client_id.startsWith('id_'));
      assert.ok(data.client_secret.startsWith('sk_'));
      assert.strictEqual(data.name, 'test-app');
      assert.strictEqual(data.credits, 10);

      clientId = data.client_id;
      clientSecret = data.client_secret;
    });

    it('should get API key info with valid secret', async () => {
      const res = await fetch(`${BASE_URL}/api/keys/${clientId}`, {
        headers: { 'X-Client-Secret': clientSecret },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.client_id, clientId);
      assert.strictEqual(data.credits, 10);
    });

    it('should reject invalid secret', async () => {
      const res = await fetch(`${BASE_URL}/api/keys/${clientId}`, {
        headers: { 'X-Client-Secret': 'wrong' },
      });
      assert.strictEqual(res.status, 401);
    });
  });

  describe('OAuth Flow', () => {
    it('should reject authorize without client_id', async () => {
      const res = await fetch(`${BASE_URL}/oauth/authorize?redirect_uri=http://example.com`);
      assert.strictEqual(res.status, 400);
    });

    it('should reject authorize with invalid client_id', async () => {
      const res = await fetch(
        `${BASE_URL}/oauth/authorize?client_id=invalid&redirect_uri=http://example.com`
      );
      assert.strictEqual(res.status, 400);
    });

    it('should redirect to Google with valid client_id', async () => {
      const res = await fetch(
        `${BASE_URL}/oauth/authorize?client_id=${clientId}&redirect_uri=http://example.com/callback`,
        { redirect: 'manual' }
      );
      assert.strictEqual(res.status, 302);
      const location = res.headers.get('location');
      assert.ok(location?.includes('accounts.google.com'));
    });

    it('should reject token exchange without code', async () => {
      const res = await fetch(`${BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('should reject token exchange with invalid credentials', async () => {
      const res = await fetch(`${BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'test',
          client_id: 'invalid',
          client_secret: 'invalid',
        }),
      });
      // 400 for invalid client_id (not found), 401 for wrong secret
      assert.ok([400, 401].includes(res.status));
    });
  });
});
