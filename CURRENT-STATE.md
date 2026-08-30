# Top Token: current state

Audited 2026-08-30, after Phase C. Every line below reflects what was executed
or inspected on that date, not what is documented or intended.

**Classification key:** IMPLEMENTED · PARTIALLY IMPLEMENTED · MOCK ONLY ·
SPECIFICATION ONLY · MISSING · BLOCKED (external credentials / legal decision)

---

## Headline

The Angular storefront is finished and verified for its scope. A real NestJS
backend now exists on top of a real PostgreSQL database: migrations run, the
schema enforces its own invariants, and authentication, sessions and order
authorization are implemented and tested against a live server.

What is still absent is commerce itself. Catalog, cart, checkout, payment and
fulfillment endpoints have not been built, so the Angular app continues to run
in mock mode and has never fetched a product from the backend. No payment
provider, supplier or mail provider is connected.

---

## Capability matrix

| Capability | Status | Evidence / note |
|---|---|---|
| **Frontend** | | |
| Angular app (24 routes, 131 TS files) | IMPLEMENTED | production build passes, 0 warnings |
| Routing | IMPLEMENTED | 24 routes × 6 viewports = 144 loads, 0 findings |
| RTL / Hebrew-first | IMPLEMENTED | verified in browser at 6 widths |
| Design system + tokens | IMPLEMENTED | no UI kit dependency |
| Accessibility | PARTIALLY IMPLEMENTED | 53/53 mechanical checks; no screen-reader or IS 5568 audit |
| Domain layer (zero Angular imports) | IMPLEMENTED | framework-independent |
| **Data layer** | | |
| 11 API abstractions | IMPLEMENTED | abstract classes double as DI tokens |
| 11 mock implementations | IMPLEMENTED | in-memory, deterministic |
| 11 HTTP implementations | PARTIALLY IMPLEMENTED | code complete; **still never executed against the backend**, because the endpoints they call do not exist yet |
| DTO / mapper boundary | IMPLEMENTED | 40 unit tests, safe enum coercion |
| HTTP error model | IMPLEMENTED | 24 unit tests; backend emits the same envelope |
| Idempotency keys (client side) | PARTIALLY IMPLEMENTED | derived and sent; server-side storage exists but no commerce endpoint consumes it yet |
| **Backend foundation** | | |
| NestJS service, `/api/v1` prefix | IMPLEMENTED | boots, serves, tested over HTTP |
| Configuration validation | IMPLEMENTED | fails fast before DI; 19 unit tests |
| Typed error envelope | IMPLEMENTED | matches the Angular mapper; no Nest-shaped bodies, no stack traces |
| Structured logging + correlation IDs | IMPLEMENTED | redaction tested; header injection rejected |
| Health / readiness | IMPLEMENTED | readiness performs a real database query and reports 503 when it fails |
| Security headers, CORS allowlist | IMPLEMENTED | no wildcard origin in any environment |
| **Database** | | |
| PostgreSQL 18.4 | IMPLEMENTED (local/test) | started by `embedded-postgres`, UTF-8, approved for development only |
| Prisma schema (30 models, 18 enums) | IMPLEMENTED | enums verified field by field against the frozen frontend domain |
| Migrations | IMPLEMENTED | applied by `prisma migrate deploy` |
| Database-enforced invariants | IMPLEMENTED | 20 CHECK constraints plus partial unique indexes; 25 tests prove PostgreSQL rejects the invalid writes |
| Seed | IMPLEMENTED | deterministic, idempotent, marked development data throughout |
| **Auth** | | |
| Email OTP (passwordless) | IMPLEMENTED | code hashed with scrypt, single use, attempt-limited, rate-limited |
| Email delivery of the code | MISSING | no mail provider; local development echoes the code in a header, which configuration validation forbids outside development |
| Sessions / httpOnly cookie | IMPLEMENTED | token hashed at rest, never in the body, never in a log, rotated on sign-in, revocable server-side |
| Order ownership authorization | IMPLEMENTED | not-found rather than forbidden; an order id alone grants nothing |
| Guest orders claimed at sign-in | IMPLEMENTED | transferred before session rotation, only from the placing session |
| Rate limiting | IMPLEMENTED | stored in PostgreSQL, so a restart grants no fresh budget |
| Account UI wired to the backend | MISSING | the Angular account page still uses the mock |
| **Commerce (all still mock)** | | |
| Catalog / product / offer endpoints | MISSING | data is seeded in PostgreSQL, but no controller serves it |
| Cart, checkout, pricing endpoints | MISSING | server-side pricing does not exist yet |
| Orders endpoints | PARTIALLY IMPLEMENTED | read and authorization exist; order *creation* does not |
| Inventory reservation | SPECIFICATION ONLY | constraints exist and are enforced; no reservation logic |
| **Payments** | | |
| Provider-agnostic abstraction | IMPLEMENTED (client) | no card field anywhere |
| Simulator | IMPLEMENTED (client) | 5 deterministic branches, browser-tested |
| Payment tables and invariants | IMPLEMENTED | one live intent per order, refunds capped at the captured amount |
| Payment endpoints, webhooks | MISSING | no controller exists |
| Real provider | BLOCKED | needs a merchant account and a business decision |
| **Fulfillment** | | |
| Tables and invariants | IMPLEMENTED | one fulfillment per order item, enforced by the database |
| DigitalCode / manual delivery | MOCK ONLY (client) | mock emits a `DEMO-` code |
| `FulfillmentProvider` port, operator queue | MISSING | not in code |
| ExternalProvider | BLOCKED | requires an authorised supplier agreement |
| **Security** | | |
| No credentials collected | IMPLEMENTED | closed 9-key vocabulary enforced on both sides |
| No card data | IMPLEMENTED | verified statically and at runtime |
| localStorage hygiene | IMPLEMENTED | one writer; cart intentions only; no session material |
| CSP on the served app | MISSING | not configured on the frontend host |
| Google Fonts third-party requests | PARTIALLY IMPLEMENTED | 4 requests/page to Google; open finding |
| **Deployment** | | |
| Render config in repo | MISSING | no `render.yaml`, Dockerfile or CI |
| Frontend deployment | UNVERIFIABLE FROM REPO | if deployed from this commit it runs **mock mode** |
| Backend deployment | MISSING | runs locally only; no production database provisioned |

---

## Test results (executed 2026-08-30)

| Suite | Result | Count |
|---|---|---|
| Backend (Jest, against real PostgreSQL) | PASS | 147 / 147 in 8 suites |
| Angular unit (Karma) | PASS | 157 / 157 |
| Purchase flows (Chromium) | PASS | 57 / 57 — **mock only** |
| Route sweep (Chromium) | PASS | 144 loads, 0 findings |
| Accessibility | PASS | 53 / 53 |
| Security scan | PASS | 14 / 14 (+1 note) |
| Angular production build | PASS | 0 warnings |
| Backend type check | PASS | `tsc --noEmit` clean |
| E2E against a real backend | NOT AVAILABLE | the frontend has no backend endpoints to call yet |

---

## Environment constraints on this machine

- No system PostgreSQL (`psql`, `pg_ctl` absent) and no Docker. Tests start
  their own **PostgreSQL 18.4** through `embedded-postgres`, which requires no
  admin rights. This is a development and test convenience and must never be
  used in production.
- The cluster must be created with `ENCODING 'UTF8' TEMPLATE template0`. Left to
  the Windows locale, `initdb` produces WIN1252 and rejects every Hebrew string.
- Background processes do not survive between commands here, so
  `scripts/with-db.mjs` owns a database for the lifetime of one command.
- Node 22.17.1 / npm 10.9.2. Angular 16 does not officially support Node 22 and
  prints an unsupported-version warning on every CLI command. `backend/`
  declares Node 20.x.

---

## What blocks the next phase

Commerce endpoints are the next piece of work: catalog, cart, checkout,
server-side pricing, order creation and the payment state machine. Nothing
external blocks them; they simply have not been written. The first genuinely
external blockers arrive after that, and each is a human decision rather than a
coding task: a merchant account for payments, a mail provider for sign-in codes,
and a supplier agreement for anything fulfilled outside our own inventory.
