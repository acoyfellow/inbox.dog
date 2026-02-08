# CASA Tier 2 Checklist — inbox.dog

Google's Cloud Application Security Assessment (CASA) Tier 2 is mandatory for apps using
restricted Gmail OAuth scopes. Based on OWASP ASVS v4.0, assessed via OWASP ZAP DAST scan.

**Assessor:** TAC Security (ESOF AppSec ADA)
**Previous scan:** Sep 24, 2025 — Score 9.7 — 10 findings (1 Low, 9 Info), all must be patched.

---

## Layer 1: CASA ZAP Scan Findings (what the assessor actually checks)

These are the 10 findings from the real TAC Security DAST scan. All fixed.

| # | Finding | CWE | Severity | Status | Fix |
|---|---------|-----|----------|--------|-----|
| Z-1 | Proxy Disclosure | CWE-204 | Low | FIXED | Block TRACE/TRACK methods in middleware (index.ts) |
| Z-2 | X-Content-Type-Options Header Missing | — | Info | FIXED | Added `nosniff` via security headers middleware |
| Z-3 | Content-Type Header Missing | — | Info | FIXED | Hono sets Content-Type; middleware adds security headers |
| Z-4 | Application Error Disclosure | — | Info | FIXED | Sanitized error logging (message only, no stack traces) |
| Z-5 | Strict-Transport-Security Header Not Set | — | Info | FIXED | Added HSTS via middleware + `_headers` file |
| Z-6 | Information Disclosure - Suspicious Comments | — | Info | FIXED | Removed TODO comments from production HTML |
| Z-7 | Re-examine Cache-control Directives | — | Info | FIXED | `Cache-Control: no-store` on tokens, keys, refresh |
| Z-8 | Storable but Non-Cacheable Content | — | Info | FIXED | Explicit cache directives on all sensitive responses |
| Z-9 | User Agent Fuzzer | — | Info | FIXED | Consistent error handling via global error handler |
| Z-10 | User Controllable HTML Element Attribute | — | Info | FIXED | Astro auto-escapes; CSP + X-Frame-Options set |

---

## Layer 2: Code-Level Security Audit (defense in depth)

These won't fail the ZAP scan but are real vulnerabilities that a deeper assessment
or attacker would find.

### Authentication (ASVS V2)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-1 | Timing-safe secret comparison | FIXED | utils.ts, api.ts, oauth.ts | `timingSafeEqual()` via HMAC comparison on all 4 sites |
| C-2 | Timing-safe webhook signature | FIXED | webhooks.ts | HMAC-based constant-time comparison |
| C-3 | Client secrets hashed at rest | REVIEW | api.ts, kv.ts | Stored plaintext. SHA-256 hash + compare recommended. |
| C-4 | Remove unused JWT_SECRET | FIXED | types.ts, config files | Removed from Env, .env.example, .dev.vars.example, wrangler.toml, README, setup script |

### Access Control (ASVS V4)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-5 | Webhook idempotency (no double-credit) | FIXED | webhooks.ts | session.id dedup via KV (24hr TTL) |
| C-6 | Atomic credit deduction | REVIEW | oauth.ts:295 | Read-modify-write race on KV. Low risk at current scale. |
| C-7 | Key revocation / deletion endpoint | FIXED | api.ts | DELETE /api/keys/:clientId with auth |

### Input Validation (ASVS V5)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-8 | POST /api/keys schema validation | REVIEW | api.ts | Manual validation. Effect Schema exists but not wired. |
| C-9 | POST /api/checkout schema validation | REVIEW | api.ts | Manual validation. Effect Schema exists but not wired. |
| C-10 | Credits bounds validation (min/max/int) | REVIEW | api.ts | No bounds — 0, negative, fractional accepted. |
| C-11 | POST /oauth/token schema validation | REVIEW | oauth.ts | Manual validation. Effect Schema exists but not wired. |
| C-12 | redirect_uri allowlist validation | FIXED | oauth.ts, api.ts, schemas.ts | Per-client URI allowlist stored on API key, validated on /oauth/authorize |
| C-13 | Content-Type enforcement on POST | REVIEW | api.ts, oauth.ts | No check — Hono parses JSON regardless of content-type. |
| C-14 | Auth code data from KV validated | REVIEW | kv.ts | Raw type assertion, no schema decode. |

### Cryptography (ASVS V6)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-15 | Application-layer encryption in KV | REVIEW | kv.ts | Tokens as plaintext JSON. KV is encrypted at rest by CF. |

### Error Handling & Logging (ASVS V7)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-16 | Sanitize global error logging | FIXED | index.ts | Logs `err.message` only, no stack/objects |
| C-17 | Sanitize OAuth error logging | FIXED | oauth.ts | Logs error class name only |
| C-18 | Sanitize Stripe error logging | FIXED | api.ts | Logs HTTP status only |

### Data Protection (ASVS V8)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-19 | Data deletion endpoint | FIXED | api.ts | DELETE /api/keys/:clientId with timing-safe auth |

### API Security (ASVS V13)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-20 | Rate limiting | FIXED | index.ts | KV-based: 5/min key creation, 20/min token exchange |
| C-21 | CORS explicit methods/headers | FIXED | index.ts | Explicit allowMethods, allowHeaders per route group |
| C-22 | Request body size limits | REVIEW | wrangler.toml | CF Workers has 100MB default. No custom limit set. |

### Configuration (ASVS V14)

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-23 | Staging/prod KV namespace isolation | REVIEW | wrangler.toml | Same KV ID for all environments. |
| C-24 | Stripe webhook timestamp validation | FIXED | webhooks.ts | Rejects events >5 min old |

### Landing Site

| # | Requirement | Status | Location | Notes |
|---|-------------|--------|----------|-------|
| C-25 | CDN scripts with SRI integrity hash | FIXED | Layout.astro | sha384 integrity on highlight.js CSS + JS |
| C-26 | Landing security headers (_headers file) | FIXED | public/_headers | CSP, HSTS, X-Frame-Options, Permissions-Policy |
| C-27 | Demo OAuth uses state parameter | REVIEW | demo.astro | No CSRF state in authorize URL. |
| C-28 | Demo doesn't store secrets in localStorage | REVIEW | demo.astro | client_secret in localStorage. |

---

## Scoreboard

### Layer 1 — CASA ZAP Scan (must pass for certification)

| Status | Count |
|--------|-------|
| FIXED | 10 |
| OPEN | 0 |

### Layer 2 — Code Review (should fix for real security)

| Status | Count |
|--------|-------|
| FIXED | 16 |
| REVIEW | 12 |

---

## Fix Priority Order

### Phase 1: Pass the ZAP scan (Z-1 through Z-10) — DONE
All headers/config. Done in a single middleware + `_headers` file.

### Phase 2: Critical code fixes — DONE
1. **C-1/C-2**: Timing-safe comparisons (5 locations) — `timingSafeEqual()` utility
2. **C-12**: redirect_uri allowlist (prevents auth code theft)
3. **C-19**: Data deletion endpoint (Google GDPR requirement)
4. **C-5/C-24**: Webhook idempotency + timestamp validation
5. **C-20/C-21**: Rate limiting + explicit CORS
6. **C-4**: Removed dead JWT_SECRET config
7. **C-7**: Key deletion endpoint
8. **C-16/C-17/C-18**: Sanitized all error logging

### Phase 3: Hardening (remaining REVIEW items)
- Wire Effect Schemas into route handlers (C-8 through C-11)
- Secret hashing at rest (C-3)
- Content-Type enforcement (C-13)
- Auth code schema validation (C-14)
- KV namespace isolation (C-23)
- Demo page state parameter (C-27)
- Demo page localStorage (C-28)

---

## Reference

- **Assessor used:** TAC Security ($540-720)
- **Scan tool:** OWASP ZAP (DAST) via ESOF AppSec ADA
- **Previous score:** 9.7 (passed)
- **Scope:** https://inbox.dog (all endpoints)
- **Recertification:** Annual (12 months from LOV date)
