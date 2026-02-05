/**
 * Full OAuth flow test - requires Google OAuth credentials
 * Set TEST_GOOGLE_EMAIL and TEST_GOOGLE_PASSWORD to run
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

describe('Full OAuth Flow (integration)', { skip: !process.env.TEST_GOOGLE_EMAIL }, () => {
  let clientId;
  let clientSecret;

  before(async () => {
    // Create API key
    const res = await fetch(`${BASE_URL}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'integration-test' }),
    });
    const data = await res.json();
    clientId = data.client_id;
    clientSecret = data.client_secret;
    console.log('Created test API key:', clientId);
  });

  it('should complete full OAuth flow', async () => {
    // This test would require browser automation (Playwright) to:
    // 1. Navigate to authorize URL
    // 2. Log in to Google
    // 3. Grant permissions
    // 4. Capture redirect with code
    // 5. Exchange code for token
    // 6. Verify token works with Gmail API
    
    // For now, just verify the authorize endpoint redirects correctly
    const authUrl = `${BASE_URL}/oauth/authorize?` + 
      `client_id=${clientId}&redirect_uri=http://localhost:3000/callback`;
    
    const res = await fetch(authUrl, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    
    const location = res.headers.get('location');
    assert.ok(location?.includes('accounts.google.com'), 'Should redirect to Google');
    assert.ok(location?.includes('client_id='), 'Should include client_id');
    assert.ok(location?.includes('redirect_uri='), 'Should include redirect_uri');
  });
});

describe('OAuth Error Handling', () => {
  it('should handle missing redirect_uri', async () => {
    const res = await fetch(`${BASE_URL}/oauth/authorize?client_id=test`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error?.includes('redirect_uri'));
  });

  it('should handle expired state', async () => {
    const res = await fetch(`${BASE_URL}/oauth/callback?code=test&state=expired-state`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error?.includes('state') || data.error?.includes('expired'));
  });

  it('should handle missing code in callback', async () => {
    const res = await fetch(`${BASE_URL}/oauth/callback?state=test`);
    assert.strictEqual(res.status, 400);
  });
});
