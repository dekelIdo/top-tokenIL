# Top Token: current state

Audited 2026-08-30, after Phase D. Every line below reflects what was executed
or inspected on that date, not what is documented or intended.

**Classification key:** IMPLEMENTED · PARTIALLY IMPLEMENTED · MOCK ONLY ·
SPECIFICATION ONLY · MISSING · BLOCKED (external credentials / legal decision)

---

## Headline

The storefront now runs on PostgreSQL. In the staging configuration the Angular
app fetches its catalog over HTTP from the NestJS backend, and the whole chain
has been driven in a browser: Angular, HTTP, NestJS, Prisma, PostgreSQL, DTO,
mapper, UI. Catalog, cart pricing and checkout are real and server-authoritative.

What is still missing is the second half of the purchase. **No order can be
placed against the real backend**, because order creation does not exist yet.
Payment and fulfillment have enforced database invariants but no endpoints. The
production build still runs in mock mode, and no payment provider, mail provider
or supplier is connected.

---

## Capability matrix

| Capability | Status | Evidence / note |
|---|---|---|
| **Frontend** | | |
| Angular app (24 routes) | IMPLEMENTED | production and staging builds pass, 0 warnings |
| Routing | IMPLEMENTED | 24 routes × 6 viewports = 144 loads, 0 findings |
| RTL / Hebrew-first | IMPLEMENTED | verified in browser at 6 widths |
| Accessibility | PARTIALLY IMPLEMENTED | 53/53 mechanical checks; no screen-reader or IS 5568 audit |
| Domain layer (zero Angular imports) | IMPLEMENTED | framework-independent |
| **Data layer** | | |
| 11 API abstractions, mock + HTTP | IMPLEMENTED | one binding file chooses; nothing else knows which is active |
| HTTP implementations | PARTIALLY IMPLEMENTED | catalog, cart, checkout and content **executed against the real backend**; payment, order-creation and fulfillment clients still have no endpoint to call |
| DTO / mapper boundary | IMPLEMENTED | 40 unit tests, safe enum coercion |
| Cart persistence | IMPLEMENTED | `localStorage` holds offer ids, quantities and cached display text; a reload keeps the cart. Cached prices are render-only and proven non-authoritative in the browser harness |
| Idempotency keys (client side) | PARTIALLY IMPLEMENTED | derived and sent; storage exists in PostgreSQL but **no endpoint consumes them yet** |
| **Backend foundation** | | |
| NestJS service, `/api/v1` prefix | IMPLEMENTED | |
| Configuration validation | IMPLEMENTED | fails fast before DI; 19 unit tests |
| Typed error envelope | IMPLEMENTED | matches the Angular mapper; no stack traces, no Nest-shaped bodies |
| Structured logging + correlation IDs | IMPLEMENTED | redaction tested; header injection rejected |
| Health / readiness | IMPLEMENTED | readiness runs a real query and reports 503 when it fails |
| Security headers, CORS allowlist | IMPLEMENTED | no wildcard origin in any environment |
| **Database** | | |
| PostgreSQL 18.4 | IMPLEMENTED (local/test) | started by `embedded-postgres`, UTF-8, development only |
| Prisma schema (30 models, 18 enums) | IMPLEMENTED | enums verified against the frozen frontend domain |
| Migrations | IMPLEMENTED | `prisma migrate deploy` |
| Database-enforced invariants | IMPLEMENTED | 20 CHECK constraints plus partial unique indexes; 25 tests prove PostgreSQL rejects the invalid writes |
| Seed | IMPLEMENTED | deterministic, idempotent, marked development data |
| **Catalog** | | |
| Games, platforms, regions, facets | IMPLEMENTED | derived from live offers, so a filter never leads to an empty result |
| Product search, detail, offers, related | IMPLEMENTED | paginated and capped; a product with no live offer is never returned |
| Inventory visibility | IMPLEMENTED | an exact count is published only when stock is genuinely low |
| **Cart and pricing** | | |
| Server-side pricing | IMPLEMENTED | one service prices the cart preview and the checkout; the client sends only an offer id and a quantity |
| Price/total/discount tampering | IMPLEMENTED (rejected) | the DTOs have no price field; sending one is a 422 |
| Coupon resolution | IMPLEMENTED | resolved from the promotion row; an unknown code is worth nothing |
| **Checkout** | | |
| Server-owned session | IMPLEMENTED | lines and figures frozen at creation; a later catalog price change does not move them |
| Ownership (anonymous + authenticated) | IMPLEMENTED | not-found rather than forbidden |
| Dynamic requirements | IMPLEMENTED | closed 9-key vocabulary allowlisted on both sides; universal fields added server-side |
| Survives reload and restart | IMPLEMENTED | stored in PostgreSQL |
| **Auth** | | |
| Email OTP (passwordless) | IMPLEMENTED | scrypt-hashed, single use under concurrency, attempt- and rate-limited |
| Email delivery of the code | MISSING | no mail provider; local development echoes it in a header, which configuration forbids outside development |
| Sessions / httpOnly cookie | IMPLEMENTED | hashed at rest, never in a body or a log, rotated on sign-in, revocable |
| Order ownership authorization | IMPLEMENTED | an order id alone grants nothing |
| Guest orders claimed at sign-in | IMPLEMENTED | transferred before rotation, only from the placing session |
| Rate limiting | IMPLEMENTED | stored in PostgreSQL, so a restart grants no fresh budget |
| **Orders** | | |
| Order read + status | IMPLEMENTED | with ownership |
| **Order creation** | **MISSING** | **the next phase; no order can be placed against the real backend** |
| Inventory reservation | SPECIFICATION ONLY | constraints exist and are enforced; no reservation logic |
| **Payments** | | |
| Provider-agnostic abstraction | IMPLEMENTED (client) | no card field anywhere |
| Simulator | IMPLEMENTED (client, mock mode only) | 5 deterministic branches |
| Payment tables and invariants | IMPLEMENTED | one live intent per order; refunds capped at the captured amount |
| Payment endpoints, webhooks | MISSING | no controller exists |
| Real provider | BLOCKED | merchant account and a business decision |
| **Fulfillment** | | |
| Tables and invariants | IMPLEMENTED | one fulfillment per order item, enforced by the database |
| Descriptors | IMPLEMENTED | served from the backend; no instant-delivery or guarantee language |
| Delivery execution | MOCK ONLY (client) | mock emits a `DEMO-` code |
| Operator queue / admin | MISSING | |
| ExternalProvider | BLOCKED | requires an authorised supplier agreement |
| **Content** | | |
| Promotions, FAQ, support tickets | IMPLEMENTED | live promotions only |
| Reviews and ratings | IMPLEMENTED | counted from rows; an unreviewed product reports no rating rather than a flattering default; seeded reviews are unverified |
| **Security** | | |
| No credentials collected | IMPLEMENTED | closed vocabulary enforced on both sides; a bad database row is dropped on the way out |
| No card data | IMPLEMENTED | verified statically and at runtime |
| localStorage hygiene | IMPLEMENTED | no session material; cached prices are not authoritative |
| CSP on the served app | MISSING | not configured on the frontend host |
| Google Fonts third-party requests | PARTIALLY IMPLEMENTED | 4 requests/page to Google; open finding |
| **Deployment** | | |
| Render config in repo | MISSING | no `render.yaml`, Dockerfile or CI |
| Frontend deployment | UNVERIFIABLE FROM REPO | if deployed from this commit it runs **mock mode** |
| Backend deployment | MISSING | runs locally only; no production database provisioned |
| Staging configuration | PARTIALLY IMPLEMENTED | `apiMode: 'http'`, pointed at `http://localhost:3000/api` because nothing is hosted yet |

---

## Test results (executed 2026-08-30)

| Suite | Result | Count |
|---|---|---|
| Backend (Jest, real PostgreSQL) | PASS | 222 / 222 in 10 suites |
| — commerce security | PASS | 60 |
| — auth and session security | PASS | 45 |
| — database invariants | PASS | 25 |
| — content integrity | PASS | 15 |
| Browser E2E against the real backend | PASS | 25 / 25 |
| Purchase flows (Chromium) | PASS | 57 / 57 — **mock mode** |
| Route sweep | PASS | 144 loads, 0 findings |
| Accessibility | PASS | 53 / 53 |
| Security scan | PASS | 14 / 14 (+1 note) |
| Angular unit (Karma) | PASS | 157 / 157 |
| Production and staging builds | PASS | both, 0 warnings |
| Backend type check | PASS | `tsc --noEmit` clean |
| E2E of a completed purchase against the real backend | NOT AVAILABLE | order creation does not exist yet |

---

## Environment constraints on this machine

- No system PostgreSQL and no Docker. Tests start their own **PostgreSQL 18.4**
  through `embedded-postgres`, which needs no admin rights. Development and test
  only; it must never be used in production.
- The cluster must be created with `ENCODING 'UTF8' TEMPLATE template0`. Left to
  the Windows locale, `initdb` produces WIN1252 and rejects every Hebrew string.
- Background processes do not survive between commands here, so
  `scripts/with-db.mjs` owns a database for the lifetime of one command, and the
  browser harness starts the backend as a child process.
- The development database persists between runs, so test fixtures must not
  assume an empty schema.
- Node 22.17.1 / npm 10.9.2. Angular 16 warns on every CLI command that Node 22
  is unsupported. `backend/` declares Node 20.x.

---

## What blocks the next phase

Order creation is next, and nothing external blocks it: turning a checkout that
is ready for payment into an order, under an idempotency key, with transactional
inventory reservation.

The first genuinely external blockers arrive after that, and each is a human
decision rather than a coding task: a merchant account before any real payment,
a mail provider before sign-in codes can reach a customer, and a supplier
agreement before anything is fulfilled from outside our own inventory.
