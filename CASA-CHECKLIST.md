# CASA Tier 2 Checklist — inbox.dog

Google's Cloud Application Security Assessment (CASA) Tier 2 is mandatory for apps using
restricted Gmail OAuth scopes. Based on OWASP ASVS v4.0, assessed via OWASP ZAP DAST scan.

**Assessor:** TAC Security (ESOF AppSec ADA)
**Previous scan:** Sep 24, 2025 — Score 9.7 — 10 findings (1 Low, 9 Info), all must be patched.

---

## Layer 1: CASA ZAP Scan Findings (what the assessor actually checks)

These are the 10 findings from the real TAC Security DAST scan. All must be fixed to pass.

| # | Finding | CWE | Severity | Status | Fix |
|---|---------|-----|----------|--------|-----|
| Z-1 | Proxy Disclosure | CWE-204 | Low | OPEN | Disable TRACE/OPTIONS on CF, custom error pages, strip Server header |
| Z-2 | X-Content-Type-Options Header Missing | — | Info | OPEN | Add `X-Content-Type-Options: nosniff` to all responses |
| Z-3 | Content-Type Header Missing | — | Info | OPEN | Ensure all responses include proper Content-Type header |
| Z-4 | Application Error Disclosure | — | Info | OPEN | Sanitize error responses — no stack traces or internal details |
| Z-5 | Strict-Transport-Security Header Not Set | — | Info | OPEN | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| Z-6 | Information Disclosure - Suspicious Comments | — | Info | OPEN | Remove TODO/DEBUG/HACK comments from production HTML/JS |
| Z-7 | Re-examine Cache-control Directives | — | Info | OPEN | Add `Cache-Control: no-store` on sensitive responses (tokens, keys) |
| Z-8 | Storable but Non-Cacheable Content | — | Info | OPEN | Ensure API responses have explicit cache directives |
| Z-9 | User Agent Fuzzer | — | Info | OPEN | Ensure consistent error handling across all User-Agent values |
| Z-10 | User Controllable HTML Element Attribute (Potential XSS) | — | Info | OPEN | Sanitize/escape user-controlled values in HTML attributes |

### Implementation Plan for Layer 1

**Fix Z-1 (Proxy Disclosure):**
- Cloudflare zone config: disable TRACE method via WAF rule
- Worker: return 405 for TRACE/TRACK methods
- Custom error handler already sanitizes responses (Z-4 partial)

**Fix Z-2, Z-3, Z-5 (Security Headers) — single middleware:**
```typescript
// worker/src/index.ts — security headers middleware
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
});
```

**Fix Z-4 (Error Disclosure):**
- Already partially done (errorToResponse sanitizes). Verify no raw errors leak.

**Fix Z-6 (Suspicious Comments):**
- Remove/strip TODO/FIXME from production output
- Check landing site HTML for dev comments

**Fix Z-7, Z-8 (Cache-Control):**
```typescript
// On all API/OAuth responses returning sensitive data:
c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
c.header('Pragma', 'no-cache');
```

**Fix Z-9 (User Agent Fuzzer):**
- Ensure error handling is consistent regardless of User-Agent
- Already handled by global error handler — verify no different behavior

**Fix Z-10 (User Controllable HTML):**
- Audit landing site for unescaped user input in HTML attributes
- Astro auto-escapes by default — verify demo page redirect_uri handling

---

## Layer 2: Code-Level Security Audit (defense in depth)

These won't fail the ZAP scan but are real vulnerabilities that a deeper assessment
or attacker would find. Fix these for actual security, not just compliance.

### Authentication (ASVS V2)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-1 | Timing-safe secret comparison | FAIL | api.ts:51,85 oauth.ts:276,331 | All use `!==`. Use crypto.subtle.timingSafeEqual(). |
| C-2 | Timing-safe webhook signature | FAIL | webhooks.ts:99 | `===` on HMAC hex strings. |
| C-3 | Client secrets hashed at rest | FAIL | api.ts:25, kv.ts:49 | Stored plaintext. SHA-256 hash + compare. |
| C-4 | Remove unused JWT_SECRET | REVIEW | types.ts:15 | Dead config — remove or implement. |

### Access Control (ASVS V4)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-5 | Webhook idempotency (no double-credit) | FAIL | webhooks.ts:49-56 | Record session.id, check before crediting. |
| C-6 | Atomic credit deduction | REVIEW | oauth.ts:280-295 | Read-modify-write race on KV. |
| C-7 | Key revocation endpoint | REVIEW | (missing) | No DELETE /api/keys/:clientId. |

### Input Validation (ASVS V5)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-8 | POST /api/keys schema validation | FAIL | api.ts:10 | Schema exists in schemas.ts but unused. |
| C-9 | POST /api/checkout schema validation | FAIL | api.ts:66 | Schema exists but unused. |
| C-10 | Credits bounds validation (min/max/int) | FAIL | api.ts:72 | No bounds — 0, negative, fractional all accepted. |
| C-11 | POST /oauth/token schema validation | FAIL | oauth.ts:250 | Schema exists but unused. |
| C-12 | redirect_uri allowlist validation | FAIL | oauth.ts:142-143,231-236 | **CRITICAL**: Open redirect → auth code theft. |
| C-13 | Content-Type enforcement on POST | FAIL | api.ts, oauth.ts | No check — CSRF via simple content types. |
| C-14 | Auth code data from KV validated | REVIEW | kv.ts:89-96 | Raw type assertion, no schema. |

### Cryptography (ASVS V6)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-15 | Application-layer encryption in KV | FAIL | kv.ts:49,80 | Tokens/secrets as plaintext JSON. |

### Error Handling & Logging (ASVS V7)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-16 | Sanitize global error logging | FAIL | index.ts:39 | Full error objects to console. |
| C-17 | Sanitize OAuth error logging | FAIL | oauth.ts:243 | May contain token exchange details. |
| C-18 | Sanitize Stripe error logging | FAIL | api.ts:115 | Full Stripe error response logged. |

### Data Protection (ASVS V8)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-19 | Data deletion endpoint | FAIL | (missing) | **Required by Google.** No DELETE endpoint. |

### API Security (ASVS V13)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-20 | Rate limiting | FAIL | All routes | Zero rate limiting anywhere. |
| C-21 | CORS restricted to specific origins | FAIL | index.ts:12-13 | `cors()` = wildcard `*` on all routes. |
| C-22 | Request body size limits | FAIL | All routes | No limit configured. |

### Configuration (ASVS V14)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-23 | Staging/prod KV namespace isolation | FAIL | wrangler.toml:15,28,40 | Same KV ID for all environments. |
| C-24 | Stripe webhook timestamp validation | FAIL | webhooks.ts:70-77 | Timestamp not checked — replay attack. |

### Landing Site

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-25 | CDN scripts with SRI integrity hash | FAIL | Layout.astro:34,108 | highlight.js without integrity attr. |
| C-26 | Landing security headers (_headers file) | FAIL | (missing) | No _headers for Cloudflare Pages. |
| C-27 | Demo OAuth uses state parameter | REVIEW | demo.astro:147 | No CSRF state in authorize URL. |
| C-28 | Demo doesn't store secrets in localStorage | REVIEW | demo.astro:96-97 | client_secret in localStorage. |

---

## Scoreboard

### Layer 1 — CASA ZAP Scan (must pass for certification)

| Status | Count |
|--------|-------|
| OPEN (must fix) | 10 |
| FIXED | 0 |

### Layer 2 — Code Review (should fix for real security)

| Status | Count |
|--------|-------|
| FAIL | 24 |
| REVIEW | 6 |
| PASS | 8 |

---

## Fix Priority Order

### Phase 1: Pass the ZAP scan (Z-1 through Z-10)
All are headers/config. Can be done in a single middleware + _headers file.

### Phase 2: Critical code fixes
1. **C-12**: redirect_uri allowlist (auth code theft)
2. **C-19**: Data deletion endpoint (Google requirement)
3. **C-1/C-2**: Timing-safe comparisons (5 locations)
4. **C-20**: Rate limiting
5. **C-21**: CORS restrictions

### Phase 3: Hardening
Everything else — schema validation, secret hashing, encryption at rest,
webhook idempotency, logging sanitization, environment isolation.

---

## Reference

- **Assessor used:** TAC Security ($540-720)
- **Scan tool:** OWASP ZAP (DAST) via ESOF AppSec ADA
- **Previous score:** 9.7 (passed)
- **Scope:** https://inbox.dog (all endpoints)
- **Recertification:** Annual (12 months from LOV date)
