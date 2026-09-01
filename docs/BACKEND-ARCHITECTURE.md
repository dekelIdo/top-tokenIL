# EASYCOINS: backend architecture

The intended production architecture. **Nothing here is implemented.** This
document exists so the backend can be built in the next phase without
reverse-engineering the Angular app.

---

## 1. System overview

```
                                  EASYCOINS
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
       Angular Web (SPA)                              Backend API
              │                                               │
  ┌───────────┴───────────┐                   ┌───────────────┴───────────────┐
  │ Presentation          │                   │ Transport (HTTP controllers)  │
  │  pages, ui components │                   │  DTOs, validation, versioning │
  ├───────────────────────┤                   ├───────────────────────────────┤
  │ Facades               │                   │ Application services          │
  │  cart, checkout,      │                   │  use cases, transactions,     │
  │  catalog, order       │                   │  idempotency, authorization   │
  ├───────────────────────┤                   ├───────────────────────────────┤
  │ API abstractions      │                   │ Domain                        │
  │  11 abstract classes  │                   │  pricing, order & payment     │
  ├───────────────────────┤                   │  state machines, invariants   │
  │ HTTP client + mappers │                   ├───────────────────────────────┤
  │  DTO → domain         │                   │ Persistence (repositories)    │
  └───────────┬───────────┘                   └───────────────┬───────────────┘
              │                                               │
              └──────────── HTTPS /api/v1 ───────────────────►│
                                                              │
                                                       PostgreSQL
                                                              │
              ┌───────────────┬───────────────┬───────────────┤
              │               │               │               │
          Payment         Fulfillment      Email/SMS      Object store
          provider         providers        provider      (invoices)
              │
          Webhooks ──────────────────────────────────────────►│
```

## 2. Layer responsibilities

### Frontend (already built)

| Layer | Owns | Must never |
|---|---|---|
| Presentation | Rendering, input, routing, RTL, a11y | Contain a business rule or a price calculation |
| Facades | UI state, orchestration of calls, optimistic display | Decide prices, discounts or order state |
| API abstractions | The contract shape | Know whether mock or HTTP is bound |
| HTTP client + mappers | Transport, DTO→domain, error mapping, idempotency keys | Leak a DTO above the mapper |

The frontend is a **rendering and input layer**. It is never the source of truth
for price, discount, inventory, payment success, order state, fulfillment state,
authorization or customer identity.

### Backend (to be built)

| Layer | Owns | Must never |
|---|---|---|
| Transport | HTTP, DTO validation, auth extraction, versioning, rate limits | Contain business logic |
| Application | Use cases, transaction boundaries, idempotency, authorization decisions | Talk HTTP or SQL directly |
| Domain | Pricing, state machines, invariants, region rules | Know about HTTP, the ORM or a provider SDK |
| Persistence | Repositories, queries, migrations | Contain business rules |
| Integrations | Payment/fulfillment/email adapters behind ports | Be imported by the domain |

**Dependency rule:** dependencies point inward. Domain depends on nothing.
Integrations implement ports the application layer defines.

## 3. Shape: modular monolith

One deployable service, internally partitioned by module. **Not** microservices,
no Kubernetes, no event bus, no distributed transactions.

Why: the entire commercial flow — reserve inventory, create an order, record a
payment — must be **atomic**. In one database with one transaction that is a
`BEGIN`/`COMMIT`. Split across services it becomes a saga with compensations, an
order of magnitude more code and failure modes, for a business that has not yet
taken its first shekel. The team that will operate this is small.

```
src/
  modules/
    catalog/        games, products, variants, offers, regions, platforms
    inventory/      stock, reservations
    cart/           cart validation and pricing
    checkout/       sessions, requirement engine, snapshots
    payments/       intents, providers, webhooks
    orders/         order lifecycle, state machine
    fulfillment/    providers, jobs, delivery
    customers/      identity, OTP auth, sessions
    promotions/     coupons, discount engine
    support/        tickets, FAQ
    reviews/
    audit/          append-only audit log
    notifications/  email/SMS abstraction
  platform/
    http/           server, middleware, error mapping, rate limiting
    db/             connection, migrations, transaction helper
    config/         env loading and validation
    observability/  logging, metrics, tracing
```

Each module exposes a small public interface (`index.ts`) and keeps its
repositories private. Cross-module calls go through those interfaces, never
into another module's tables. **This is the seam** along which a module could
later be extracted into a service — if there is ever a real reason.

## 4. Suggested stack

Chosen for boring reliability and for a small team, not novelty.

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js LTS + TypeScript | Same language and domain types as the frontend |
| Framework | NestJS **or** Fastify + a light DI container | Nest gives modules/DI out of the box; Fastify is lighter. Either satisfies this architecture |
| Database | PostgreSQL | Transactions, constraints, `SELECT … FOR UPDATE`, JSONB for snapshots |
| Migrations | Prisma Migrate or node-pg-migrate | Versioned, reviewed, reversible |
| Jobs | `pg-boss` (Postgres-backed queue) | Fulfillment retries and expiry sweeps without adding Redis or a broker |
| Cache | None initially | Catalog reads are cacheable at the CDN/HTTP layer first |
| Email | Provider behind a port | See §7 |
| Hosting | Render (already in use) | Web service + managed Postgres |

**Decision to revisit, not now:** a separate queue/broker, a read replica, and a
cache tier. Add them when a measurement demands it.

## 5. Sharing types with the frontend

The domain layer in `src/app/domain/` is plain TypeScript with **zero Angular
imports** — a deliberate Phase 1 decision. Two options:

1. **Recommended first step:** copy the domain enums and interfaces into the
   backend and keep the wire DTOs as the contract. Two codebases, one contract,
   no build coupling. The mapper layer already absorbs drift.
2. **Later, if it earns its keep:** extract `@easycoins/domain` as a shared
   package in a monorepo. Only worth the tooling cost once both sides are
   actively changing together.

Do not share the *DTOs* by importing frontend files into the backend; the DTO is
the contract, and it should be defined once in the backend and mirrored (or
generated) into the client. Generating `dto/index.ts` from an OpenAPI spec is
the natural next step and would remove hand-maintenance.

## 6. Transaction boundaries

One transaction per use case, opened in the application layer:

| Use case | Transaction contents |
|---|---|
| Create checkout session | Re-price cart, reserve inventory, insert session + items + snapshot |
| Create order | Verify session, insert order + items, convert reservations, insert audit rows |
| Confirm payment (webhook) | Insert payment event, update intent, update order, enqueue fulfillment job |
| Complete fulfillment | Update fulfillment, mark inventory sold, update order status, insert audit |

Rules:

- Never hold a transaction open across an external HTTP call to a provider.
  Call the provider **outside** the transaction; persist the result inside a new
  one, keyed idempotently.
- Use `SELECT … FOR UPDATE` on the order row when transitioning state, so two
  concurrent webhooks cannot both advance it.
- Every state transition is guarded by the current state in the `WHERE` clause
  (`UPDATE orders SET status='PAID' WHERE id=$1 AND status='PAYMENT_PROCESSING'`),
  so a lost update is impossible rather than merely unlikely.

## 7. Ports and adapters

The domain defines ports; integrations implement them. Nothing provider-specific
reaches the domain.

```ts
interface PaymentProvider {
  readonly id: PaymentProviderId;
  createIntent(input: CreateIntentInput): Promise<ProviderIntent>;
  confirmIntent(input: ConfirmIntentInput): Promise<ProviderIntent>;
  getIntent(providerIntentId: string): Promise<ProviderIntent>;
  verifyWebhook(rawBody: Buffer, headers: Headers): WebhookVerification;
}

interface FulfillmentProvider {
  readonly method: FulfillmentMethod;
  requiredInputs(): readonly CheckoutFieldKey[];
  fulfil(job: FulfillmentJob): Promise<FulfillmentOutcome>;
}

interface NotificationSender {
  send(message: NotificationMessage): Promise<void>;
}
```

`NotificationService` composes senders by channel:

```
NotificationService
  ├── EmailSender      (transactional provider)
  ├── SmsSender        (future)
  └── WhatsAppSender   (future — only if the Business API terms permit it)
```

Events that produce a notification: `order.confirmed`, `payment.succeeded`,
`payment.failed`, `fulfillment.completed`, `fulfillment.delayed`,
`refund.completed`, `auth.code_requested`. Templates are data, keyed by event
and locale, so adding a language is not a code change.

## 8. Admin / operations foundation

**No admin UI in this phase.** The backend is designed so one can be added
without reshaping the domain:

- Every mutating use case is a service method callable from an admin controller,
  not logic embedded in a customer-facing controller.
- Every state transition is explicit and guarded, so an operator action goes
  through the same state machine as an automated one.
- The audit log (`docs/SECURITY-ARCHITECTURE.md` §7) records an actor on every
  entry, with `actor_type ∈ (customer, system, operator, provider)`.
- Manual fulfillment is a first-class provider, so an operator marking an order
  delivered is a normal fulfillment transition.

Eventual admin surface: products, offers, prices, inventory, orders, fulfillment,
customers, promotions, refunds, support, audit log.

## 9. Observability

**Structured JSON logs**, one line per event, with:

```
timestamp, level, message, requestId, sessionTrace, customerId?,
orderId?, paymentIntentId?, module, durationMs, outcome
```

- `requestId` comes from the client's `X-Request-Id` header (§1 of the contract)
  and is echoed in responses and error bodies, so a customer's screenshot maps to
  a log query.
- **Never logged:** OTP codes, session cookies, card data, `Idempotency-Key`
  values that embed customer data, full request bodies of auth endpoints.
- Metrics worth having from day one: order creation rate, payment success rate by
  provider, webhook processing lag, fulfillment time by method, 4xx/5xx rate,
  reservation expiry rate.
- Error tracking (Sentry or equivalent) with PII scrubbing on.

## 10. Environments

| Environment | API mode | Database | Payment provider |
|---|---|---|---|
| Local | `mock` (default) or `http` against a local backend | Local Postgres | Simulator |
| Staging | `http` | Staging Postgres, non-production data | Provider **sandbox** |
| Production | `http` | Production Postgres | Provider live |

The frontend switch is `environment.apiMode`; `src/environments/environment.staging.ts`
already exists and builds (`ng build --configuration staging`).

## 11. Frontend readiness checklist

Already done, so the backend has a client waiting for it:

- [x] Versioned URLs (`/api/v1`) built by `ApiClient`
- [x] Complete HTTP implementation of all 11 API abstractions
- [x] DTO → domain mapper layer with unknown-value tolerance
- [x] Error envelope mapping for every documented status
- [x] Idempotency keys on every money/order mutation
- [x] Correlation ids on every request
- [x] Cookie-based session (`withCredentials`), no token storage
- [x] Timeout and a conservative retry policy
- [x] Mock and HTTP bound through one file, chosen by configuration
