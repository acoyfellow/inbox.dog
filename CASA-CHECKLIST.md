# CASA Tier 2 Checklist for Cloudflare Workers

Google's [Cloud Application Security Assessment](https://appdefensealliance.dev/casa) (CASA) is required for OAuth apps requesting sensitive Gmail scopes. Tier 2 maps to OWASP ASVS Level 2 — a lab-verified security review.

inbox.dog passed CASA Tier 2. This checklist documents every control so you can do the same.

Fork this repo → check each box → submit for audit.

---

## V1: Architecture & Design

- [x] **Environment isolation** — staging/production via `wrangler.toml` `[env.staging]` and `[env.production]` with separate routes
- [x] **Secrets in env vars** — all secrets via `wrangler secret put`, never in code → `wrangler.toml` comments list required secrets
- [x] **Least privilege** — scoped Cloudflare API tokens, separate Google OAuth credentials per environment
- [x] **Minimal dependencies** — 3 runtime deps: `hono`, `effect`, `@effect/schema`

## V2: Authentication

- [x] **Timing-safe secret comparison** — `timingSafeEqual()` in `worker/src/utils.ts` uses HMAC-then-compare to prevent timing oracles
- [x] **OAuth state parameter** — random 128-bit state ID, stored in KV with 10-min TTL → `worker/src/routes/oauth.ts` `GET /authorize`
- [x] **State consumed on use** — deleted from KV immediately after validation → `oauth.ts` callback handler
- [x] **Per-client redirect_uri allowlist** — `redirectUris[]` on ApiKey schema, validated with URL normalization → `oauth.ts` authorize handler
- [x] **redirect_uri validation** — must be HTTPS (localhost exempt for dev) → `worker/src/routes/api.ts` `POST /keys`

## V3: Session Management

- [x] **Short-lived auth codes** — 5-min KV TTL → `oauth.ts` callback, `putAuthCode(..., 300)`
- [x] **Short-lived OAuth state** — 10-min KV TTL → `oauth.ts` authorize, `putOAuthState(..., 600)`
- [x] **Auth codes single-use** — deleted from KV after exchange → `oauth.ts` token handler
- [x] **No-store cache headers** — `Cache-Control: no-store` on all token responses → `oauth.ts` token handler

## V5: Input Validation

- [x] **Schema validation** — Effect Schema on KV reads (`ApiKeySchema`, `OAuthStateSchema`, `GoogleTokenResponseSchema`) → `worker/src/services/kv.ts`, `worker/src/services/google.ts`
- [x] **Request body schemas** — `CreateKeyRequestSchema`, `TokenExchangeRequestSchema`, `CheckoutRequestSchema` → `worker/src/schemas.ts`
- [x] **URL validation** — redirect URIs parsed with `new URL()`, protocol checked → `api.ts` `POST /keys`
- [x] **Structured error responses** — every error includes `code`, `message`, `action`, `docs` → `worker/src/routes/oauth.ts` `errorToResponse()`

## V6: Cryptography

- [x] **AES-256-GCM token encryption** — encrypt/decrypt in `worker/src/crypto.ts`, tokens encrypted before KV storage
- [x] **PBKDF2 key derivation** — 100,000 iterations, SHA-256, salt derived from secret → `crypto.ts` `deriveKey()`
- [x] **Random 12-byte IV** — `crypto.getRandomValues()` per encryption operation → `crypto.ts` `encrypt()`
- [x] **Cryptographic IDs** — 128-bit random IDs via `crypto.getRandomValues()` → `worker/src/utils.ts` `generateId()`
- [x] **Cryptographic secrets** — 256-bit random secrets → `utils.ts` `generateSecret()`

## V7: Error Handling & Logging

- [x] **No stack traces leaked** — global `app.onError()` returns generic message → `worker/src/index.ts`
- [x] **Typed error hierarchy** — `Data.TaggedError` for each error class → `worker/src/errors.ts`
- [x] **Generic auth failure messages** — "Invalid credentials" not "wrong password for user X" → `oauth.ts`
- [x] **Console logging** — errors logged server-side, no sensitive data in messages

## V8: Data Protection

- [x] **Data deletion endpoint** — `DELETE /api/keys/:clientId` purges API key and all associated data → `api.ts`
- [x] **KV TTLs on temp data** — auth codes (5 min), OAuth state (10 min), rate limit counters (1 min)
- [x] **No tokens in URLs** — tokens only in POST bodies and response JSON, never query params
- [x] **Encrypted tokens at rest** — AES-256-GCM before KV storage → `crypto.ts`

## V9: Communications

- [x] **X-Content-Type-Options: nosniff** → `index.ts` middleware
- [x] **Strict-Transport-Security** — `max-age=31536000; includeSubDomains` → `index.ts`
- [x] **X-Frame-Options: DENY** → `index.ts`
- [x] **Referrer-Policy: strict-origin-when-cross-origin** → `index.ts`
- [x] **Content-Security-Policy** — `default-src 'none'; frame-ancestors 'none'` on API responses → `index.ts`
- [x] **Permissions-Policy** — restrict sensitive browser APIs → `index.ts`
- [x] **TRACE/TRACK blocked** — 405 response → `index.ts`
- [x] **CORS scoped** — explicit methods and headers per route group → `index.ts`

## V10: Webhook Security

- [x] **Stripe signature verification** — HMAC-SHA256 with `crypto.subtle` → `worker/src/routes/webhooks.ts` `verifyStripeSignature()`
- [x] **Timestamp validation** — 5-minute tolerance window prevents replay attacks → `webhooks.ts`
- [x] **Timing-safe signature comparison** — HMAC-then-compare on signature bytes → `webhooks.ts`
- [x] **Idempotency** — KV key `webhook_processed:{session_id}` with 24h TTL prevents double-processing → `webhooks.ts`

## V13: API Security

- [x] **Rate limiting** — KV-based sliding window: `/api/keys` 5/min, `/oauth/token` 20/min → `index.ts`
- [x] **Proper status codes** — 400, 401, 402, 404, 405, 429, 500 used correctly
- [x] **Machine-readable errors** — `{ error: { code, message, action, docs } }` on every error response
- [x] **404 on unknown routes** — JSON for API paths, generic for others → `index.ts` `notFound()`

## Cloudflare-Specific

- [x] **Environment separation** — `[env.staging]` and `[env.production]` in `wrangler.toml` with separate routes
- [x] **Secrets management** — `wrangler secret put` for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [x] **Static assets** — landing site served via `[assets]` binding, not Worker logic
- [x] **KV for state** — no filesystem, no global variables, all state in KV with TTLs

---

## Audit Preparation

- [ ] Run `npm audit` — resolve critical and high vulnerabilities
- [ ] Document dependencies — list each dep and why it's needed
- [ ] Data flow diagram — show where tokens travel (Google → Worker → KV → Client)
- [ ] Complete Google's SAQ (Self-Assessment Questionnaire)
- [ ] Run E2E tests — `cd e2e && node tests/full-flow.test.js`
- [ ] Verify all secrets rotated from any prior leaks
- [ ] Test rate limiting manually (hit endpoints > threshold)
- [ ] Test webhook replay (send old timestamp, verify rejection)
- [ ] Test redirect_uri bypass (send unregistered URI, verify rejection)
- [ ] Review Cloudflare WAF settings (enable managed ruleset if available)

## Files That Matter

| File | What it does |
|------|-------------|
| `worker/src/index.ts` | Security headers, CORS, rate limiting, TRACE blocking |
| `worker/src/utils.ts` | `timingSafeEqual()`, `generateId()`, `generateSecret()` |
| `worker/src/crypto.ts` | AES-256-GCM encrypt/decrypt for token storage |
| `worker/src/routes/oauth.ts` | OAuth flow with state, redirect validation, token exchange |
| `worker/src/routes/api.ts` | Key CRUD, data deletion, credential validation |
| `worker/src/routes/webhooks.ts` | Stripe webhook verification, replay protection, idempotency |
| `worker/src/schemas.ts` | Effect Schema definitions for all data types |
| `worker/src/errors.ts` | Tagged error types — no leaking internals |
| `worker/src/services/kv.ts` | KV operations with schema validation on reads |
| `worker/wrangler.toml` | Environment isolation, KV bindings, asset config |

---

*Based on inbox.dog's CASA Tier 2 audit. Fork, check the boxes, ship.*
