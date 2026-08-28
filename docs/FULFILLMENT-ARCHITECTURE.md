# Top Token — Fulfillment Architecture

How a paid order becomes a delivered product. This is the part of Top Token that
differs most between product categories, so it is built as a set of providers
behind one port rather than one generic implementation.

**No external fulfillment integration exists.** Manual delivery and stocked
digital codes are the only mechanisms the business can honestly operate today.

---

## 1. Principles

1. **One provider per delivery mechanism.** A gift-card code and an in-game
   service have nothing in common operationally; forcing them through one code
   path produces a component that serves neither.
2. **Nothing is delivered before payment is verified.** The delivery payload is
   not merely hidden in the UI — it is not readable until the order is `PAID`.
3. **Every method states an honest ETA, or none at all.** An omitted estimate
   renders as no estimate. Inventing one to fill the space is a promise the
   business cannot keep.
4. **A method with no live integration is `NOT_SUPPORTED` and unsellable.**
   `AUTOMATED_API` may only be used where a real, authorised supplier exists.
5. **Manual is a first-class provider**, not a fallback. Most of what Top Token
   sells today is delivered by a person.

## 2. The port

```ts
interface FulfillmentProvider {
  readonly method: FulfillmentMethod;

  /** Which checkout answers this method needs. Drives the requirement engine. */
  requiredInputs(): readonly CheckoutFieldKey[];

  /** Called only for an order whose payment is verified. */
  fulfil(job: FulfillmentJob): Promise<FulfillmentOutcome>;

  /** How to behave when fulfil() fails. */
  readonly retryPolicy: {
    maxAttempts: number;
    backoff: 'none' | 'linear' | 'exponential';
    timeoutMs: number;
  };

  /** After this long without progress, escalate to an operator. */
  readonly escalateAfterMinutes: number;
}

interface FulfillmentJob {
  fulfillmentId: FulfillmentId;
  orderId: OrderId;
  orderItemId: OrderItemId;
  offerId: OfferId;
  quantity: number;
  regionId: RegionId;
  platformId: PlatformId;
  /** Non-credential answers only. */
  checkoutValues: CheckoutFieldValues;
  attempt: number;
}

type FulfillmentOutcome =
  | { kind: 'DELIVERED'; payload: DeliveryPayload }
  | { kind: 'PENDING_OPERATOR'; reason: LocalizedText }
  | { kind: 'WAITING_FOR_CUSTOMER'; missing: readonly CheckoutFieldKey[] }
  | { kind: 'RETRY'; reason: string }
  | { kind: 'FAILED'; reason: LocalizedText; permanent: true };
```

## 3. Provider tree

```
FulfillmentProvider (port)
   │
   ├── DigitalCodeFulfillment      stocked codes released from inventory
   ├── ManualFulfillment           an operator delivers and marks complete
   ├── ManualReviewFulfillment     human approval, then one of the others
   ├── AccountBasedFulfillment     in-game service, coordinated with the customer
   └── ExternalProviderFulfillment supplier API — none authorised yet
```

### 3.1 DigitalCodeFulfillment — `DIGITAL_CODE`

Stocked codes: PlayStation Store gift cards, FC Points, V-Bucks, COD Points.

| Aspect | Value |
|---|---|
| Required inputs | `EMAIL`; `REGION_CONFIRMATION` when the offer is region-locked |
| Trigger | Order reaches `PAID` |
| Mechanism | Claim `quantity` rows from `inventory_units` for the offer, `FOR UPDATE SKIP LOCKED`, mark `SOLD`, attach to the order item |
| ETA | 0–5 minutes |
| Automated | Yes |
| Retry | 3 attempts, linear backoff — a transient DB failure, not a business failure |
| Failure | No units available → `PENDING_OPERATOR`. **The order is not cancelled**; an operator sources a code or refunds |
| Delivery | `{ kind: 'CODE', code, redeemUrl? }`, revealed on the order page and emailed |

**Region is part of the claim, not an afterthought:** units are stocked per
offer, and an offer is (variant × platform × region). It is structurally
impossible to hand a US code to an IL order, because they are different offers
with different inventory.

Codes are stored encrypted (`inventory_units.secret_cipher`) and erased 90 days
after delivery.

### 3.2 ManualFulfillment — `MANUAL_DELIVERY`

An operator performs the delivery. This is how EA FC coins are delivered today.

| Aspect | Value |
|---|---|
| Required inputs | `EMAIL`, `PLATFORM_ACCOUNT_HANDLE` (public username), optional `SERVICE_NOTE` |
| Trigger | Order reaches `PAID`; job appears in the operator queue |
| Mechanism | Operator contacts the customer, performs the delivery, marks it complete |
| ETA | 5–30 minutes (published on the product) |
| Automated | No |
| Retry | Not automatic. Unclaimed after 15 minutes → escalate |
| Failure | Operator marks `FAILED` with a reason → refund path |
| Delivery | `{ kind: 'INSTRUCTIONS', instructions }` |

**Never requires a password, a 2FA code or a recovery code.** The public handle
is enough to identify the recipient; anything more is a phishing pattern.

### 3.3 ManualReviewFulfillment — `MANUAL_REVIEW`

A human fraud/KYC check before another provider runs.

| Aspect | Value |
|---|---|
| Trigger | Order reaches `PAID` **and** the risk layer flags `REVIEW` |
| ETA | 10–120 minutes |
| Outcome | Approved → delegate to the underlying method; rejected → cancel and refund |
| Escalation | 120 minutes |

### 3.4 AccountBasedFulfillment — `IN_GAME_SERVICE`

An operator performs a service inside the game, in coordination with the
customer and in their presence.

| Aspect | Value |
|---|---|
| Required inputs | `EMAIL`, `GAME_PLAYER_ID` (public in-game id), `PLATFORM_SELECTION`, optional `SERVICE_NOTE` |
| ETA | 30–240 minutes |
| Automated | No |
| Outcome | `WAITING_FOR_CUSTOMER` while scheduling, then delivered |
| Delivery | `{ kind: 'IN_GAME', operatorNote }` |

**Hard constraints, and they are not negotiable:**

- We never ask for, store or transmit account credentials of any kind.
- We do not log into a customer's account.
- We do not automate account access.
- The service is performed with the customer present.

The checkout vocabulary makes the first of these structurally true: there is no
requirement key that could carry a credential, on either side of the boundary.

### 3.5 ExternalProviderFulfillment — `AUTOMATED_API`

A supplier or publisher API provisions the product directly.

**No such integration is authorised, and this method is not sellable today.**
Before one is built, verify and record:

- official API availability and documentation
- a commercial agreement permitting resale
- terms of service, specifically on automation
- account-security requirements imposed by the publisher
- region restrictions the API enforces
- rate limits, sandbox availability, and the support path when it fails

Do not guess, and do not infer permission from the existence of an endpoint.

### 3.6 `NOT_SUPPORTED`

Modelled so a product can be listed for information without being purchasable.
The offer is rejected by cart validation, so it can never reach checkout.

## 4. Fulfillment state machine

```
                    payment verified
                          │
                          ▼
                     ┌─────────┐
                     │ PENDING │
                     └────┬────┘
                          │ job picked up
                          ▼
                   ┌────────────┐
        ┌──────────│ PROCESSING │──────────┐
        │          └─────┬──────┘          │
        │ needs input    │ done            │ transient error
        ▼                ▼                 ▼
┌──────────────────┐ ┌───────┐      (retry within policy)
│WAITING_FOR_      │ │ READY │              │
│CUSTOMER          │ └───┬───┘        attempts exhausted
└────────┬─────────┘     │                  ▼
         │ input given   ▼               ┌────────┐
         └──────────►┌───────────┐       │ FAILED │
                     │ DELIVERED │       └───┬────┘
                     └───────────┘           │
                                             ▼
                                  CANCELLED | REFUNDED
```

| Transition | Driven by |
|---|---|
| `→ PENDING` | Backend, on payment verification |
| `PENDING → PROCESSING` | Job worker |
| `PROCESSING → WAITING_FOR_CUSTOMER` | Provider, when an input is missing |
| `PROCESSING → READY → DELIVERED` | Provider or operator |
| `PROCESSING → FAILED` | Provider, after retries |
| `→ CANCELLED` / `→ REFUNDED` | Operator or refund flow |

Frontend-visible: all of them, via `GET /orders/{id}/status`, which the order
page polls every 2.5s until terminal. Backend-only: attempt counts, provider job
ids, operator identity.

An order's `fulfillment_status` is the **least advanced** of its items, so a
partially delivered order never reports as delivered.

## 5. Orchestration

```
order → PAID
   │
   ├─ for each order_item: create a fulfillments row (PENDING)
   ├─ enqueue one job per fulfillment           (pg-boss, Postgres-backed)
   └─ notify: order confirmed
                │
                ▼
        worker picks up a job
                │
        resolve provider by method
                │
        provider.fulfil(job)
                │
   ┌────────────┼───────────────┬────────────────┐
   ▼            ▼               ▼                ▼
DELIVERED   WAITING_FOR     RETRY            FAILED
   │        CUSTOMER          │                 │
   │            │        re-enqueue with     escalate,
   │            │         backoff            notify, refund path
   ▼            ▼
notify      notify + ask for the missing input
   │
   ▼
all items delivered → order → DELIVERED → notify
```

Why a Postgres-backed queue rather than a broker: fulfillment state and job
state can then be updated in **one transaction**. With an external broker they
cannot, and every failure mode becomes a reconciliation problem.

## 6. Idempotency and safety

- A job may be delivered more than once by the queue. `fulfil()` must therefore
  be idempotent per `fulfillmentId`: if the fulfillment is already `DELIVERED`,
  return the existing payload instead of claiming another code.
- Code claiming uses `SELECT … FOR UPDATE SKIP LOCKED` so two workers cannot
  claim the same unit; `inventory_units_one_order_item UNIQUE` makes a double
  claim fail loudly rather than silently double-spending.
- `fulfillments_one_per_order_item UNIQUE` prevents duplicate fulfillment rows.
- The payment guard is asserted inside the job, not only at enqueue time: an
  order that was refunded between enqueue and execution must not deliver.

## 7. Operator queue

The manual providers need people, which means the backend must expose:

- an open-jobs list, oldest first, with the customer's public handle and notes
- claim / release, so two operators do not work the same job
- mark delivered, with the delivery payload
- mark failed, with a customer-safe reason
- request more information from the customer (`WAITING_FOR_CUSTOMER`)
- an SLA view: jobs past their published ETA

Every operator action writes an audit entry with `actor_type = 'operator'`.
**No admin UI in this phase** — the service methods are designed so one can be
added without touching the domain.

## 8. Customer-facing honesty

What the storefront already does, and must continue to do:

- Every offer displays its delivery method and, when published, its ETA.
- An offer with no ETA displays no estimate.
- The order page shows a live timeline and the real fulfillment status.
- A manual order says a person is delivering it.
- A code is revealed only after payment, and is labelled a demo code while the
  simulator is in use.
- A failure says what happened and what we are doing, never a stack trace.

## 9. Testing

| Level | Cases |
|---|---|
| Unit | Provider selection by method, required-input resolution, state transitions, retry policy, "no delivery before payment" |
| Integration | Code claiming under concurrency (two workers, one unit), reservation expiry, partial delivery, refund after delivery |
| E2E | Digital code purchase to reveal; manual purchase to operator completion; missing-input path |
| Security | Fetching a delivery payload for an unpaid order; another customer's order; an expired reservation |
