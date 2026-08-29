# Top Token — Current State

Audited 2026-08-29. Every line below reflects what was executed or inspected on
that date, not what is documented or intended.

**Classification key:** IMPLEMENTED · PARTIALLY IMPLEMENTED · MOCK ONLY ·
SPECIFICATION ONLY · MISSING · BLOCKED (external credentials / legal decision)

---

## Headline

The Angular storefront is finished and genuinely verified for its scope. **There
is no backend, no database, and the HTTP client has never sent a request to a
real server.** Nine of thirteen documents describe systems that do not exist,
which those documents state plainly.

---

## Capability matrix

| Capability | Status | Evidence / note |
|---|---|---|
| **Frontend** | | |
| Angular app (24 routes, 131 TS files) | IMPLEMENTED | prod build 549.75 kB / 136.28 kB, 0 warnings |
| Routing | IMPLEMENTED | 24 routes × 6 viewports = 144 loads, 0 findings |
| RTL / Hebrew-first | IMPLEMENTED | verified in browser at 6 widths |
| Design system + tokens | IMPLEMENTED | no UI kit dependency |
| Accessibility | PARTIALLY IMPLEMENTED | 53/53 mechanical checks; no screen-reader or IS 5568 audit |
| Domain layer (zero Angular imports) | IMPLEMENTED | 131 files, framework-independent |
| **Data layer** | | |
| 11 API abstractions | IMPLEMENTED | abstract classes double as DI tokens |
| 11 mock implementations | IMPLEMENTED | in-memory, deterministic |
| 11 HTTP implementations | PARTIALLY IMPLEMENTED | code complete; **never executed against a server** |
| DTO / mapper boundary | IMPLEMENTED | 40 unit tests, safe enum coercion |
| HTTP error model | IMPLEMENTED | 24 unit tests across every documented status |
| Idempotency keys (client side) | PARTIALLY IMPLEMENTED | derived and sent; **no server honours them** |
| **Commerce (all mock)** | | |
| Catalog / product / offer | MOCK ONLY | static seed in `data/mock/catalog.seed.ts` |
| Cart | MOCK ONLY | `localStorage` holds offer ids + quantities only |
| Server-side pricing | MOCK ONLY | mock re-prices; no server exists |
| Checkout session | MOCK ONLY | in-memory, lost on reload |
| Dynamic checkout requirements | IMPLEMENTED (client) | closed 9-key vocabulary, no credential possible |
| Orders | MOCK ONLY | **in-memory `Map`; destroyed by page reload** |
| Order status polling | MOCK ONLY | 2.5s poll until terminal |
| **Backend** | | |
| Backend service | MISSING | `backend/src` contains 16 directories and **0 files** |
| Prisma schema | SPECIFICATION ONLY | 30 models, 18 enums; validates, **never migrated** |
| Migrations | MISSING | `prisma/migrations/` does not exist |
| Seed | MISSING | no seed file |
| PostgreSQL | MISSING | not installed; no Docker; no database ever created |
| `.env` / `.env.example` | MISSING | `prisma validate` fails without a manual `DATABASE_URL` |
| **Auth** | | |
| Email OTP | SPECIFICATION ONLY | documented; no implementation |
| Sessions / httpOnly cookie | MISSING | client sends `withCredentials`; nothing issues a cookie |
| Order ownership authorization | MISSING | mock returns any order id to anyone |
| Account UI | PARTIALLY IMPLEMENTED | collects an email; mock discards it, state stays ANONYMOUS |
| **Payments** | | |
| Provider-agnostic abstraction | IMPLEMENTED (client) | no card field anywhere |
| Simulator | IMPLEMENTED | 5 deterministic branches, browser-tested |
| Payment state machine | MOCK ONLY | `EXPIRED` modelled but has no logic |
| Webhooks | SPECIFICATION ONLY | no endpoint exists |
| Real provider | BLOCKED | needs merchant account + business decision |
| Refunds | MISSING | absent from code and from the Prisma schema |
| **Fulfillment** | | |
| DigitalCode | MOCK ONLY | emits a `DEMO-` code |
| Manual delivery | MOCK ONLY | 6-second timer |
| ManualReview / AccountBased | SPECIFICATION ONLY | enum + descriptor, no logic |
| ExternalProvider | BLOCKED | requires an authorised supplier agreement |
| `FulfillmentProvider` port | SPECIFICATION ONLY | documented; not in code |
| Operator queue / admin | MISSING | no admin routes, no API |
| **Inventory** | | |
| Available → Reserved → Sold | SPECIFICATION ONLY | in the Prisma schema; no logic, no DB |
| **Security** | | |
| No credentials collected | IMPLEMENTED | 14/14 scan; closed vocabulary enforced both sides |
| No card data | IMPLEMENTED | verified statically and at runtime |
| localStorage hygiene | IMPLEMENTED | one writer; cart intentions only |
| Analytics PII blocklist | IMPLEMENTED | verified at runtime |
| CORS / CSRF / rate limiting / security headers | MISSING | all require a server |
| CSP | MISSING | not configured on the host |
| Google Fonts third-party requests | PARTIALLY IMPLEMENTED | 4 requests/page to Google; open finding |
| **Ops** | | |
| Health / readiness endpoints | MISSING | |
| Structured logging, correlation IDs | PARTIALLY IMPLEMENTED | client sends IDs; nothing receives them |
| Audit log | SPECIFICATION ONLY | table in schema; no writer |
| **Deployment** | | |
| Render config in repo | MISSING | no `render.yaml`, Dockerfile or CI |
| Frontend deployment | UNVERIFIABLE FROM REPO | if deployed from this commit it runs **mock mode** |
| Backend deployment | MISSING | nothing to deploy |

---

## Test results (executed 2026-08-29)

| Suite | Result | Count |
|---|---|---|
| Angular unit (Karma) | PASS | 157 / 157 |
| Route sweep (Chromium) | PASS | 144 loads, 0 findings |
| Purchase flows (Chromium) | PASS | 57 / 57 — **mock only** |
| Accessibility | PASS | 53 / 53 |
| Security scan | PASS | 14 / 14 (+1 note) |
| Dev / production / staging builds | PASS | all 3 |
| Backend unit tests | NOT AVAILABLE | none exist |
| Backend integration tests | NOT AVAILABLE | none exist |
| E2E against a real backend | NOT AVAILABLE | no backend |

---

## Known contradictions between docs and reality

1. `COMMERCE-FLOWS.md` reads as though a backend participates; its BE and DB
   columns are aspirational.
2. `DATABASE-DESIGN.md` recommends `CHECK` constraints over native enums; the
   Prisma schema uses native enums. Intentional, but undocumented until now.
3. `PAYMENT-ARCHITECTURE.md` specifies refunds; refunds exist nowhere, including
   the schema.
4. `FULFILLMENT-ARCHITECTURE.md` specifies a `FulfillmentProvider` port; no such
   interface exists in code.
5. `BACKEND-IMPLEMENTATION.md` was required by the Phase 4A brief and was never
   created, because Phase 4A stopped at roughly 2%.

---

## Environment constraints on this machine

- No PostgreSQL (`psql`, `pg_ctl` absent), no Docker.
- Verified working alternative: `embedded-postgres` npm package started a real
  **PostgreSQL 18.4** on a port with `max_connections=100`, sufficient for real
  concurrency tests. No admin rights required.
- Node 22.17.1 / npm 10.9.2. Angular 16 does not officially support Node 22 and
  prints an unsupported-version warning on every CLI command.
