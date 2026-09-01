# EASYCOINS: security architecture

The production security design. Complements `docs/SECURITY-REVIEW.md`, which
records what is *verified today* in the frontend by `qa/security-scan.mjs`.

**No backend exists, so nothing here is enforced yet** except the frontend
controls marked ✅.

---

## 1. Threat model

| Asset | Threat | Control |
|---|---|---|
| Customer money | Price tampering | Server-side pricing; frozen checkout snapshot; client sends no prices ✅ |
| Customer money | Double charge | Idempotency keys; one-live-intent index; guarded transitions ✅ (client) |
| Digital codes | Theft before payment | Payload unreadable until `PAID`; encrypted at rest |
| Digital codes | Double-spend | Unique constraint per order item + row locking |
| Customer identity | Account takeover | Passwordless OTP; no password to phish or reuse ✅ |
| Customer identity | Session theft | httpOnly cookie; no token in JS-readable storage ✅ |
| Customer PII | Enumeration via order ids | High-entropy ids; auth or signed token required |
| Customer PII | Enumeration via auth | `/auth/request-code` always returns 204 |
| Gaming accounts | Credential phishing | No credential field can exist in the checkout vocabulary ✅ |
| Business | Coupon abuse | Server-side discounts; redemption limits; rate limits |
| Business | Fraud / chargebacks | Risk layer (§8) |
| System | Webhook forgery | HMAC over the raw body, timestamp window, event dedup |

## 2. Authentication — email OTP

Chosen because it removes the entire password attack surface: nothing to reuse,
leak, phish, hash, rotate or store.

```
Customer enters email
        │
        ▼
POST /auth/request-code
        │  rate limit: 3 / 15 min per email, 10 / hour per IP
        │  ALWAYS returns 204 — existence is never revealed
        ▼
Generate a 6-digit code
        │  cryptographically random
        │  stored as an Argon2id hash, never plaintext
        │  TTL 10 minutes, single use
        ▼
Send by email (the only place the plaintext exists)
        │
        ▼
POST /auth/verify-code  { email, code }
        │  max 5 attempts per code, then the code is destroyed
        │  constant-time comparison
        │  on success: consume this code AND every outstanding code for the email
        ▼
Create session
        │  opaque 256-bit id, stored hashed
        │  Set-Cookie: tt_session=…; HttpOnly; Secure; SameSite=Lax; Path=/;
        │              Max-Age=2592000
        ▼
Authenticated
```

### Session strategy, and why not `localStorage`

| Option | Verdict |
|---|---|
| **httpOnly cookie** | **Chosen.** XSS cannot read it. Sent automatically. Revocable server-side |
| JWT in `localStorage` | Rejected. Any XSS exfiltrates it, and it cannot be revoked before expiry |
| JWT in memory + refresh cookie | Rejected for now. More moving parts than a small team needs; the cookie already solves it |

The frontend is already built for this: `ApiClient` sends `withCredentials: true`,
sets no `Authorization` header, and stores no token. `qa/security-scan.mjs`
asserts that `localStorage` is written from exactly one file and holds only the
cart. ✅

- **Rotation:** issue a new session id on privilege change.
- **Expiry:** 30 days absolute; 7 days idle.
- **Logout:** revokes server-side *and* clears the cookie. Clearing alone is not
  logout.
- **CSRF:** `SameSite=Lax` blocks cross-site form posts; an `Origin`/`Referer`
  check on every mutating request is the second layer. If the storefront is ever
  embedded cross-site, add a double-submit token.

## 3. Authorization

| Resource | Rule |
|---|---|
| Catalog | Public |
| Cart / checkout session | Bearer capability — possession of the high-entropy session id |
| Order | Owning customer, **or** a signed, expiring token from the confirmation email |
| Account orders | Authenticated customer only |
| Fulfillment payload | Same as the order, **and** the order must be `PAID` |
| Admin | Operator role; every action audited |

**IDOR is the primary risk.** Rules:

- Ids used as capabilities (order, checkout session, payment intent) are ≥128
  bits of entropy and never sequential.
- Authorization is checked in the **application layer**, per use case — never
  only in a controller or, worse, only in the UI.
- Prefer `404` over `403` for a resource the caller may not see, so existence is
  not confirmed.
- Every authorization decision is a testable function, with its own test.

## 4. Never collected, never stored

Enforced structurally, not by policy alone:

- passwords (there is no password anywhere in the system)
- 2FA codes, recovery codes, security answers
- gaming-account credentials of any kind
- card numbers, expiry dates, CVV
- any authentication secret belonging to a customer

`CheckoutFieldKey` is a **closed vocabulary of nine keys**. The backend may only
return keys from it; the frontend mapper drops anything else before it can be
rendered. So even a compromised backend cannot make the storefront ask for a
password. ✅ (covered by unit tests on both the mapper and the offer catalog)

## 5. Secrets

| Secret | Lives in | Never in |
|---|---|---|
| Payment provider secret key | Backend env / secret manager | Frontend, git, logs |
| Webhook signing secret | Backend env | Frontend, git, logs |
| Database credentials | Backend env | Anywhere else |
| Email provider key | Backend env | Frontend |
| Session signing key | Backend env, rotatable | Frontend |
| Code-encryption key | KMS | Application config |

`src/environments/*.ts` ships to the browser and may hold only public
configuration: base URL, API version, feature flags, publishable keys.
`qa/security-scan.mjs` scans for secret-shaped literals on every run. ✅

**Rotation:** payment and webhook secrets quarterly and on any suspicion;
session key with overlapping validity so live sessions survive.

## 6. Transport and headers

Owned by the hosting layer (Render) plus the backend:

| Header | Value | Owner |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Host |
| `Content-Security-Policy` | see below | Host (static) / backend (API) |
| `X-Content-Type-Options` | `nosniff` | Host |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Host |
| `X-Frame-Options` / `frame-ancestors 'none'` | Deny | Host |
| `Permissions-Policy` | Deny camera, microphone, geolocation | Host |
| `Set-Cookie` | `HttpOnly; Secure; SameSite=Lax` | Backend |
| CORS | Exact storefront origins, `credentials: true` | Backend |

Proposed CSP for the storefront:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://api.easycoins.example;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

`style-src 'unsafe-inline'` is required because Angular emits component styles
inline. Removing it needs a nonce-based build — worth doing, not blocking.

**CORS:** never `*` with credentials — the combination is both invalid and a
sign of a misconfiguration. Allowlist the exact origins.

## 7. Audit log

Append-only, no `UPDATE`/`DELETE` grant for the application role.

Recorded events: `customer.created`, `customer.signed_in`, `customer.signed_out`,
`checkout.created`, `checkout.validated`, `payment_intent.created`,
`payment.succeeded`, `payment.failed`, `order.created`, `order.cancelled`,
`refund.created`, `refund.completed`, `fulfillment.started`,
`fulfillment.completed`, `fulfillment.failed`, `inventory.reserved`,
`inventory.committed`, `coupon.redeemed`, `operator.intervened`.

Each entry: event type, entity type and id, actor type and id, request id,
before/after state, IP, timestamp. **Never** an OTP code, session token, card
data or delivery secret.

## 8. Fraud and abuse

A risk layer, deliberately about transaction safety rather than customer
exclusion. **No discriminatory profiling**: no signal derived from name,
nationality, ethnicity, gender, language or neighbourhood.

Signals: order velocity per customer/IP/card fingerprint, repeated payment
failures, coupon-attempt rate, mismatch between billing region and offer region,
many accounts on one device, chargeback history, unusual order value relative to
the customer's history, fulfillment anomalies.

Outcomes:

| State | Effect |
|---|---|
| `LOW_RISK` | Normal flow |
| `REVIEW` | Payment captured, fulfillment held for `MANUAL_REVIEW` |
| `BLOCKED` | Order refused before payment, with a neutral message and a support path |

Enforcement is backend-only. Every decision is logged with its contributing
signals so it can be explained and appealed, and a human can always override.

## 9. Input handling

- Validate every request body against a schema at the transport boundary;
  reject unknown fields rather than ignoring them.
- Length-cap every free-text field server-side.
- Parameterised queries only — no string-built SQL.
- Support ticket content is stored as text and never rendered as HTML. Angular
  escapes by default; nothing may use `[innerHTML]` on customer content.
- Uploads: none today. If added, validate content type by sniffing, store
  outside the web root, and serve from a separate origin.

## 10. Rate limiting

Specified per endpoint in `docs/API-CONTRACT.md` §6. Enforced at the edge *and*
in the application, because the edge can be bypassed if the origin is reachable.
429 responses carry `Retry-After`; the frontend already renders the wait time in
Hebrew. ✅

## 11. Dependency and supply chain

- `npm audit` in CI; the build fails on a high-severity advisory in a runtime
  dependency.
- Lockfile committed; no floating versions in production dependencies.
- Dependabot or equivalent for security patches.
- Current known state: Angular 16 build-toolchain advisories, affecting the
  build only, not the shipped bundle. Tracked as debt.

## 12. Frontend controls already verified ✅

From `qa/security-scan.mjs`, 14/14 passing:

no credential-shaped fields in source · no password input in any template · no
secret-shaped literals · no secrets in environment files · `CheckoutFieldKey`
contains no credential member · `localStorage` written from one file only · no
raw console logging outside the logger · contact details never in
`localStorage`/`sessionStorage` · no cookies set by the client · order and
payment data never in browser storage · delivery code shown only after payment ·
no undeclared third-party requests · analytics strips contact and payment keys.

## 13. Open items

| Severity | Item |
|---|---|
| HIGH | No backend, so none of the server-side controls exist yet |
| MEDIUM | Fonts load from Google — third-party request on every page |
| MEDIUM | No CSP or security headers configured on the host |
| MEDIUM | Order access control specified but unimplemented |
| MEDIUM | No rate limiting anywhere |
| LOW | Angular 16 build-toolchain advisories |
| LOW | No penetration test, no SBOM review |

## 14. Security test plan

| Category | Cases |
|---|---|
| Authentication | OTP brute force, code reuse, expired code, enumeration via timing or status, session fixation, logout revocation |
| Authorization | IDOR on order/session/intent/fulfillment, privilege escalation to admin, cross-customer access |
| Rate limiting | Every documented limit, and that 429 carries `Retry-After` |
| CSRF | Cross-site mutating request with cookies present |
| CORS | Disallowed origin with credentials |
| Webhooks | Forged signature, replayed event, altered amount, out-of-order arrival |
| Input | Oversized payloads, injection attempts, unknown fields, malformed JSON |
| Money | Price tampering, currency switching, discount stacking, refund exceeding capture |
| Secrets | No secret in the bundle, in git history, or in logs |
