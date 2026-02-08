# CASA Tier 2 Checklist — inbox.dog

Google's Cloud Application Security Assessment (CASA) Tier 2 is mandatory for apps using
restricted Gmail OAuth scopes. Based on OWASP ASVS v4.0 — 73 requirements across 14 categories.

Status key: PASS | FAIL | REVIEW | N/A

---

## V2 — Authentication

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 2-1 | API key creation requires authentication | V2.1.1, V4.1.1 | FAIL | worker/src/routes/api.ts:9 | POST /api/keys is completely unauthenticated. Anyone can mint unlimited keys with free credits. |
| 2-2 | Secret comparison uses timing-safe equality | V2.4.1 | FAIL | worker/src/routes/api.ts:51,85 worker/src/routes/oauth.ts:276,331 | All 4 secret comparisons use `!==` (timing oracle). Must use crypto.subtle.timingSafeEqual(). |
| 2-3 | Stripe webhook signature uses timing-safe comparison | V2.4.1 | FAIL | worker/src/routes/webhooks.ts:99 | `expectedHex === sig` is not constant-time. |
| 2-4 | Client secrets stored hashed, not plaintext | V2.4.2 | FAIL | worker/src/routes/api.ts:25, worker/src/services/kv.ts:49 | clientSecret stored as raw string in KV JSON. Should be SHA-256 hashed. |
| 2-5 | Unused JWT_SECRET removed or implemented | V2.7.1 | REVIEW | worker/src/types.ts:15 | Declared in Env but never referenced in code. Dead config increases attack surface. |
| 2-6 | Key/session revocation mechanism exists | V3.3.1 | REVIEW | (no endpoint) | No way to revoke an API key or invalidate tokens. Needs DELETE /api/keys/:clientId. |

## V3 — Session Management

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 3-1 | OAuth state tokens have appropriate TTL | V3.5.1 | PASS | worker/src/routes/oauth.ts:167 | 600s TTL on KV. |
| 3-2 | Auth codes have TTL + single-use enforcement | V3.5.1, V3.5.2 | PASS | worker/src/routes/oauth.ts:218,291 | 300s TTL, deleted after use. |
| 3-3 | State/code tokens use CSPRNG | V3.5.3 | PASS | worker/src/utils.ts:3-17 | crypto.getRandomValues() — 128-bit IDs, 256-bit secrets. |

## V4 — Access Control

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 4-1 | Auth code bound to issuing client | V4.2.1 | PASS | worker/src/routes/oauth.ts:287 | Validates clientId matches auth code's issuer. |
| 4-2 | Webhook credit addition is idempotent | V4.1.3 | FAIL | worker/src/routes/webhooks.ts:49-56 | No session.id check — Stripe retries can double-credit. |
| 4-3 | Credit deduction is atomic | V4.1.3 | REVIEW | worker/src/routes/oauth.ts:280-295 | Read-modify-write race on KV. Concurrent requests can go negative. |

## V5 — Input Validation

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 5-1 | POST /api/keys validates request body | V5.1.1 | FAIL | worker/src/routes/api.ts:10 | Schema exists in schemas.ts but is never used. No runtime validation. |
| 5-2 | POST /api/checkout validates request body | V5.1.1 | FAIL | worker/src/routes/api.ts:66 | Same — schema exists but unused. |
| 5-3 | Credits parameter has bounds validation | V5.1.3 | FAIL | worker/src/routes/api.ts:72 | No min/max/integer check. Can pass 0, negative, or fractional values. |
| 5-4 | POST /oauth/token validates request body | V5.1.1 | FAIL | worker/src/routes/oauth.ts:250 | Schema exists but unused. |
| 5-5 | redirect_uri validated against per-client allowlist | V5.1.5 | FAIL | worker/src/routes/oauth.ts:142-143,231-236 | **CRITICAL**: No validation. Attacker can steal auth codes via redirect_uri=https://evil.com. |
| 5-6 | POST endpoints enforce Content-Type: application/json | V5.1.1, V13.1.1 | FAIL | worker/src/routes/api.ts:10,66, worker/src/routes/oauth.ts:250 | No Content-Type check. Enables CSRF via simple content types. |
| 5-7 | Auth code data from KV is schema-validated | V5.1.1 | REVIEW | worker/src/services/kv.ts:89-96 | Uses raw type assertion instead of Effect Schema. |
| 5-8 | scope parameter validated against allowlist | V5.1.1 | PASS | worker/src/routes/oauth.ts:357-365 | mapScope uses whitelist with safe fallback. |
| 5-9 | MCP: client_id sanitized in URL path | V5.1.1, V5.2.6 | FAIL | mcp/src/index.ts:231 | Path injection — no encodeURIComponent(). |

## V6 — Cryptography

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 6-1 | CSPRNG for all random values | V6.2.1 | PASS | worker/src/utils.ts:3-17 | crypto.getRandomValues(). |
| 6-2 | HMAC-SHA256 for webhook verification | V6.2.2 | PASS | worker/src/routes/webhooks.ts:81-93 | Correct algorithm. (But comparison not timing-safe — see 2-3.) |
| 6-3 | Sensitive values encrypted at rest in KV | V6.1.1 | FAIL | worker/src/services/kv.ts:49,80 | Tokens, secrets, emails stored as plaintext JSON. |
| 6-4 | Key rotation mechanism documented | V6.4.1 | REVIEW | (operational) | No rotation procedure for JWT_SECRET, STRIPE_WEBHOOK_SECRET, or clientSecrets. |

## V7 — Error Handling & Logging

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 7-1 | Global error handler doesn't log sensitive data | V7.1.1 | FAIL | worker/src/index.ts:39 | `console.error('Unhandled error:', err)` logs full error objects. |
| 7-2 | OAuth error logging doesn't leak tokens | V7.1.1 | FAIL | worker/src/routes/oauth.ts:243 | Error could contain token exchange details. |
| 7-3 | Stripe error logging sanitized | V7.1.1 | FAIL | worker/src/routes/api.ts:115 | Full Stripe error response logged. |
| 7-4 | Client error responses don't expose internals | V7.4.1 | PASS | worker/src/routes/oauth.ts:47-138 | Structured error codes, no stack traces. |
| 7-5 | MCP: Raw API errors not forwarded to client | V7.4.1 | FAIL | mcp/src/index.ts:53,151,199,243 | JSON.stringify(result.data) passes full API error payloads through. |
| 7-6 | MCP: fetch/json errors handled gracefully | V7.4.1 | FAIL | mcp/src/index.ts:19-27 | No try/catch. Network errors or non-JSON responses throw unhandled. |
| 7-7 | MCP: Audit logging for security events | V7.1.3, V7.2.1 | FAIL | mcp/src/index.ts (entire) | Zero audit logging for key creation, token exchange, etc. |

## V8 — Data Protection

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 8-1 | Data deletion endpoint exists | V8.1.2 | FAIL | (no endpoint) | **Required by Google.** No way to delete API keys, tokens, or user data. |
| 8-2 | Client secret only returned at creation time | V8.3.4 | PASS | worker/src/routes/api.ts:27-32,55-60 | GET /api/keys/:id excludes secret. |
| 8-3 | PII (email) handling documented | V8.3.1 | REVIEW | worker/src/services/kv.ts:80 | Email stored in auth code data (TTL-limited). No data classification policy. |

## V9 — Communication Security

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 9-1 | TLS enforced for all connections | V9.1.1 | PASS | wrangler.toml | Cloudflare Workers HTTPS-only. |
| 9-2 | All outbound API calls use HTTPS | V9.1.2 | PASS | worker/src/services/google.ts, worker/src/routes/api.ts:93 | All hardcoded https:// URLs. |
| 9-3 | HSTS header configured | V9.1.3 | REVIEW | (Cloudflare zone config) | Not set by app. May be set at zone level — verify in CF dashboard. |
| 9-4 | MCP: BASE_URL validated as HTTPS | V9.1.1 | REVIEW | mcp/src/index.ts:7 | Env var override can downgrade to http://. |

## V13 — API Security

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 13-1 | Rate limiting on all endpoints | V13.1.5 | FAIL | All route files | **Zero rate limiting anywhere.** Key creation, token exchange, brute-force all unlimited. |
| 13-2 | CORS restricted to specific origins | V13.1.3 | FAIL | worker/src/index.ts:12-13 | `cors()` with no args = `Access-Control-Allow-Origin: *` on all API/OAuth routes. |
| 13-3 | Request body size limits enforced | V13.1.2 | FAIL | All route files | No body size limit. CF Workers allow up to 100MB. |

## V14 — Configuration & Hardening

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| 14-1 | Security headers: X-Content-Type-Options | V14.4.1 | FAIL | worker/src/index.ts | Not set. |
| 14-2 | Security headers: X-Frame-Options | V14.4.7 | FAIL | worker/src/index.ts | Not set. |
| 14-3 | Security headers: CSP | V14.4.3 | FAIL | worker/src/index.ts | Not set. |
| 14-4 | Security headers: Referrer-Policy | V14.4.5 | FAIL | worker/src/index.ts | Not set. |
| 14-5 | Security headers: Cache-Control on token responses | V14.4.1 | FAIL | worker/src/routes/oauth.ts | Token responses not marked no-store. |
| 14-6 | Staging/production KV namespaces isolated | V14.1.1 | FAIL | worker/wrangler.toml:15,28,40 | All 3 environments share the same KV namespace ID. |
| 14-7 | Stripe webhook timestamp validated (replay protection) | V14.4.1 | FAIL | worker/src/routes/webhooks.ts:70-77 | Timestamp extracted but never checked against current time. |
| 14-8 | Secrets managed via wrangler secrets (not hardcoded) | V14.2.1 | PASS | worker/wrangler.toml:42-47 | Correct — all secrets via `wrangler secret put`. |

## Landing Site — Security Headers & External Resources

| # | Requirement | ASVS | Status | Location | Notes |
|---|-------------|------|--------|----------|-------|
| L-1 | CDN scripts loaded with SRI integrity hash | V14.2.3 | FAIL | landing/src/layouts/Layout.astro:34,108 | **HIGH**: highlight.js JS + CSS from CDN without integrity attr. CDN compromise = full XSS. |
| L-2 | Security response headers via _headers file | V14.4.x | FAIL | (missing) | No _headers file. No CSP, HSTS, X-Frame-Options, etc. |
| L-3 | Demo OAuth flow uses state parameter | V4.2.2 | REVIEW | landing/src/pages/demo.astro:147 | No CSRF state param in OAuth authorize URL. |
| L-4 | Demo doesn't store secrets in localStorage | V3.3.2 | REVIEW | landing/src/pages/demo.astro:96-97 | client_secret in localStorage — XSS exfiltrable. |

---

## Scoreboard

| Severity | Count |
|----------|-------|
| **FAIL** | 36 |
| **NEEDS REVIEW** | 12 |
| **PASS** | 14 |

### Top 5 Critical Fixes (do first)

1. **Open redirect via redirect_uri** (5-5) — auth code theft
2. **Unauthenticated key creation** (2-1) — unlimited free credits
3. **Timing-unsafe secret comparison** (2-2, 2-3) — 5 locations
4. **No rate limiting** (13-1) — compounds every other vuln
5. **No data deletion endpoint** (8-1) — explicit Google/CASA requirement
