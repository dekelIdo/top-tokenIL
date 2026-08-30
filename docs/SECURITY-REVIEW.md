# Top Token: phase 2 security review

Every claim below is checked mechanically by `node qa/security-scan.mjs`
(14 checks: 7 static source checks, 7 runtime checks against the running app).
Re-run it before any release.

## Verified

| Claim | How it is verified |
|---|---|
| **No credentials are collected.** No password, 2FA code, recovery code, CVV or PAN field exists in any model, form or template. | Static scan for credential-shaped property declarations across `src/`, plus a scan for `type="password"` in templates. Zero hits. |
| **The checkout form is structurally incapable of asking for a credential.** | `CheckoutFieldKey` is a closed vocabulary of 9 keys, asserted by the scan to contain no `PASSWORD`/`OTP`/`2FA`/`RECOVERY`/`CVV`/`CARD` member. The form renders only requirements the API returns, and only these keys exist. A unit test additionally walks every offer in the catalog and asserts no requirement label solicits a credential. |
| **No payment data enters the application.** `PaymentApiService.confirm` accepts an opaque `{ token }` only. | Type-level: `PaymentInstrumentRef` has one field. Unit test asserts no instrument payload matches `/pan\|cvv\|cardNumber\|expiry/`. |
| **Payment success is never decided by the client.** | The facade sets order state only from a `PaymentResult` returned by the API. Unit tests cover declined, cancelled, gateway-error and pending branches; in each the order is left unpaid and undelivered. |
| **No secrets in source.** | Static scan for `sk_live_`/`sk_test_`, Google API keys, PEM private keys and `apiSecret`/`clientSecret`/`privateKey` declarations. Zero hits. Environment files carry feature flags and a public base URL only. |
| **`localStorage` is written from exactly one file** (`cart-storage.service.ts`) and holds only the anonymous cart. | Static scan asserts no other file touches `localStorage`. |
| **Contact details never reach browser storage.** | Runtime: a probe fills checkout with a unique name, email and account handle, submits, and asserts none of the three appear in `localStorage`, `sessionStorage` or `document.cookie`. |
| **Order and payment data never reach browser storage.** | Runtime: after a completed order, storage is asserted free of order ids, intent ids, order references and delivered codes. |
| **No cookies are set.** | Runtime check of `document.cookie` after a full purchase. |
| **Analytics cannot leak contact or payment data.** | `AnalyticsService` strips 16 blocked key substrings from every payload before it goes anywhere; the runtime check confirms `email`, `playerId` and `cardNumber` are dropped while `orderId` and `quantity` survive. |
| **Everything read from storage is validated.** | 14 unit tests feed malformed, tampered and hostile payloads to `CartStorageService`; none reach the UI and none throw. |
| **Prices are re-derived server-side.** | Unit test tampers a stored price to ₪0.01; validation returns the catalog price. Reproduced end-to-end in the browser flow harness. |
| **Delivered codes are withheld until payment.** | The mock releases `delivery.payload` only inside `markPaid`; unit test asserts a declined order has `delivery === undefined`. |
| **No console logging outside the logger**, which is silent in production. | Static scan; zero raw `console.log/info/debug` outside `LoggerService` and the bootstrap failure handler. |

## Open findings

### MEDIUM — Fonts load from Google (third-party request on every page)

`index.html` pulls Heebo from `fonts.googleapis.com` / `fonts.gstatic.com`, so
every visitor's IP and User-Agent reach Google before any consent is possible.
For an Israeli consumer store this is a privacy exposure and an availability
dependency, and it is the only third party the app contacts.

**Fix:** self-host the Heebo woff2 subsets under `src/assets/fonts/` and declare
`@font-face` locally, or drop to a system font stack. Not done in this phase
because changing typography is a visual change and this phase was scoped to
making the existing implementation work. The scan now treats these two hosts as
the *only* permitted third parties, so any new one fails immediately.

### MEDIUM — No Content-Security-Policy

Nothing constrains what a future injected script could do. A CSP belongs on the
hosting layer (Render), roughly:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
```

`style-src 'unsafe-inline'` is required today because Angular emits component
styles inline. Add `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` and HSTS at the same time.

### MEDIUM — Order access control is unspecified

`GET /orders/{id}` currently needs only the id. Ids are sequential in the mock,
and a sequential id in production would let anyone enumerate orders and read
customer email addresses. The contract (`docs/API-CONTRACTS.md` §5) already
requires either an authenticated owner or a signed access token from the
confirmation email — this must be honoured when the backend is built, and ids
should be non-sequential.

### LOW — No rate limiting anywhere

Sign-in-link requests, support tickets and coupon attempts are unthrottled. This
is a backend concern and is specified in the contracts, but nothing enforces it
yet.

### LOW — Support ticket content is untrusted input

It is rendered as text (Angular escapes by default), so there is no XSS today.
Flagged so that nobody later renders it with `[innerHTML]`.

### LOW — `npm audit` reports advisories in the build toolchain

Angular 16's build dependencies carry known advisories. They affect the build
toolchain, not the shipped bundle. Resolving them means upgrading Angular, which
is tracked as technical debt rather than a security fix for this phase.

## Explicitly out of scope

No penetration testing, no dependency SBOM review, and no server-side review has
been performed — there is no server. **This review covers the frontend only.**
