# inbox.dog v3 → v4: CASA Tier 2 Security Patterns

Extracted from the v3 codebase (SvelteKit + Better Auth + D1) that passed Google CASA Tier 2 audit.
Reference for rebuilding these patterns in v4 (Cloudflare Worker + Effect-TS).

---

## 1. Timing-safe secret comparison

**v3 approach:** Delegated to Better Auth framework (constant-time internally). No custom `timingSafeEqual`.

**v4 action:** The v4 worker uses raw comparisons. Need to add `crypto.subtle.timingSafeEqual()` wrapper:
```ts
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  const keyA = await crypto.subtle.importKey('raw', bufA, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigA = await crypto.subtle.sign('HMAC', keyA, bufB);
  const keyB = await crypto.subtle.importKey('raw', bufB, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigB = await crypto.subtle.sign('HMAC', keyB, bufA);
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(sigA, sigB)
    : new Uint8Array(sigA).every((b, i) => b === new Uint8Array(sigB)[i]);
}
```

## 2. redirect_uri validation

**v3 approach:** Explicit redirect URIs in env vars per environment. Better Auth enforces callback path.
- Dev: `http://localhost:5173/api/auth/callback/google`
- Prod: `https://x.inbox.dog/api/auth/callback/google`

**v4 action:** Need per-client allowlist in D1/KV. Currently hardcoded.

## 3. Rate limiting

**v3 approach:** Better Auth built-in: `{ window: 60, max: 100 }` (100 req/min).
Plus per-user and per-IP limits documented.

**v4 action:** Implement rate limiting middleware in the worker. Can use Cloudflare's `request.cf` for IP + KV counters.

## 4. Security headers

**v3 approach:** SvelteKit `hooks.server.ts` middleware:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(self), camera=(self)`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- CSP via `svelte.config.js` with nonce mode

**v4 action:** Add response middleware in Hono/Effect router that sets all headers.

## 5. Data deletion endpoint

**v3 approach:** `DELETE /api/sop/[jobId]` — auth check, param validation, cascading delete via worker.

**v4 action:** Need `DELETE /api/user/data` endpoint for full account purge (CASA requirement).

## 6. Stripe webhook verification

**v3 approach:**
- Better Auth handles Stripe webhook signature verification
- Backup validation function checks if subscription was actually created
- Idempotency keys: `{orgId}:{date}:{eventType}:{batchId}`
- GitHub webhooks use HMAC-SHA256 signature verification

**v4 action:** Already have `webhooks.ts` — verify it checks `stripe-signature` header with timing-safe comparison and has idempotency.

## 7. Input validation

**v3 approach:** Zod schemas on every endpoint:
```ts
const parseResult = AgentInsertSchema.safeParse(rawData);
if (!parseResult.success) {
  return json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 });
}
```

**v4 action:** Already have `schemas.ts` with Effect Schema. Verify all routes validate before processing.

## 8. KV/database encryption at rest

**v3 approach:**
- `encryptOAuthTokens: true` in Better Auth config
- Key derivation: `SHA-256(SECRET_KEY)` → 256-bit key
- Encryption: `XChaCha20-Poly1305(data, key)` → hex-encoded ciphertext
- Storage: encrypted tokens → D1 → platform AES-256-GCM
- Decryption via `symmetricDecrypt` from `better-auth/crypto`

**v4 action:** Need encrypt/decrypt helpers for tokens stored in KV. Worker KV has no built-in encryption.

---

## CASA Audit Artifacts (in v3 repo)

- `todos/done/CASA2/AUDIT_RESULT.md` — full assessment results
- `todos/done/security.md` — compliance evidence per OWASP category
- `todos/done/encryption.md` — encryption implementation details
- `junk/SECURITY_AUDIT_CHECKLIST.md` — checklist with pass/fail
- `scripts/fill-complete-saq.js` — automated SAQ (Self-Assessment Questionnaire) filler

## Infrastructure Notes

- No `wrangler.toml` in v3 (SvelteKit on Cloudflare Pages, not Workers)
- No `_headers` file — all headers via middleware
- Cloudflare WAF for DDoS — no custom rules in code
- Staging/prod isolation via separate Cloudflare Pages projects + env vars
