# EASYCOINS: payment architecture

**No real payment provider is connected. No real money is processed.** The
current build runs a simulator that walks the same state machine a gateway
would. This document specifies the production design.

---

## 1. Principles

1. **Card data never enters our systems.** PAN, expiry and CVV are typed into a
   provider-hosted field or on the provider's own page. Our backend sees an
   opaque token; our frontend sees even less.
2. **The client never decides that a payment succeeded.** An HTTP 200 is not
   proof of anything. Order state changes because the backend concluded so —
   ideally from a signed webhook.
3. **Provider-agnostic by construction.** The domain knows `PaymentProvider`,
   never "Israel-Card" or "PayPal".
4. **Every money-moving call is idempotent.** A retry settles once.
5. **Amounts come from the frozen checkout snapshot**, never from the request.

## 2. Layering

```
Browser
  │  POST /api/v1/payment/intents            (no card data)
  ▼
Backend — payments module
  │  PaymentProvider port
  ▼
Adapter (IsraelCard | Bit | PayPal | ApplePay | GooglePay | Mock)
  │  provider SDK / REST, using the secret key held only here
  ▼
Payment provider
  │  hosted field or redirect collects the card
  │  asynchronous settlement
  ▼
Webhook ──► Backend ──► order state ──► fulfillment
```

The browser's role is to render the provider's element or follow its redirect,
then poll our API. It is never in the trust path.

## 3. The port

```ts
interface PaymentProvider {
  readonly id: PaymentProviderId;

  createIntent(input: {
    orderId: OrderId;
    amount: Money;                 // from the checkout snapshot
    customerEmail: string;
    idempotencyKey: string;
    returnUrl: string;
  }): Promise<ProviderIntent>;

  confirmIntent(input: {
    providerIntentId: string;
    instrumentToken?: string;      // opaque; never card data
    idempotencyKey: string;
  }): Promise<ProviderIntent>;

  getIntent(providerIntentId: string): Promise<ProviderIntent>;

  refund(input: {
    providerIntentId: string;
    amount: Money;
    idempotencyKey: string;
  }): Promise<ProviderRefund>;

  verifyWebhook(rawBody: Buffer, headers: Headers): WebhookVerification;
}

interface ProviderIntent {
  providerIntentId: string;
  status: PaymentStatus;
  action: PaymentAction;           // REDIRECT | CONFIRM | NONE
  clientToken?: string;            // publishable only
  failureCode?: string;            // provider code — logged, never shown
}
```

Adding a provider means writing one adapter and enabling it in configuration.
No domain, application or frontend change.

### Candidate providers (none integrated)

| Provider | Status | Notes before integrating |
|---|---|---|
| Israeli card acquirer (Tranzila / Cardcom / Isracard-affiliated) | Not integrated | Israeli merchant account, PCI scope, Hebrew invoicing, VAT handling |
| Bit | Not integrated | Bank-issued; confirm business eligibility and API terms |
| PayPal | Not integrated | Digital-goods policy and chargeback exposure |
| Apple Pay / Google Pay | Not integrated | Usually a wallet on top of the card acquirer, not a separate integration |
| **Mock** | **Active** | Development only. Flagged `simulated: true`, labelled in the UI |

**Do not begin any integration before** a merchant account exists, the PCI SAQ
level is established (SAQ-A requires that we never touch card data — the design
above preserves that), the provider's terms permit digital gaming goods, and
refund/chargeback flows are agreed.

## 4. Payment state machine

```
        createIntent
             │
             ▼
        ┌─────────┐   provider needs 3DS/redirect   ┌──────────────────┐
        │ CREATED │ ──────────────────────────────► │ REQUIRES_ACTION  │
        └────┬────┘                                 └────────┬─────────┘
             │ confirm                                       │ customer completes
             ▼                                               ▼
        ┌────────────┐                                 ┌────────────┐
        │ PROCESSING │◄────────────────────────────────│ PROCESSING │
        └─────┬──────┘                                 └────────────┘
              │
   ┌──────────┼───────────┬─────────────┐
   ▼          ▼           ▼             ▼
SUCCEEDED  FAILED     CANCELLED      EXPIRED
```

| State | Meaning | Who sets it |
|---|---|---|
| `CREATED` | Intent exists at the provider | Backend |
| `REQUIRES_ACTION` | Customer must complete 3-D Secure or a redirect | Provider |
| `PROCESSING` | Provider is deciding; **outcome unknown** | Provider |
| `SUCCEEDED` | Funds authorised/captured | **Webhook only** in production |
| `FAILED` | Declined or errored. Retryable with a new intent | Provider |
| `CANCELLED` | Abandoned or explicitly cancelled | Customer/backend |
| `EXPIRED` | Intent outlived its window | Backend sweep |

`SUCCEEDED`, `FAILED` and `CANCELLED` are terminal for that intent. A retry
creates a **new** intent against the same order.

**`PROCESSING` is not a failure.** The UI shows "still processing, do not pay
again" and polls; it must never present a retry that could double-charge.

## 5. Webhooks — the authoritative path

```
Provider
   │  POST /api/v1/webhooks/payments/{provider}
   ▼
1. Read the RAW body (before any JSON parsing)
2. Verify HMAC signature over the raw bytes with the webhook secret
3. Verify the timestamp is within ±5 minutes          → replay protection
4. Look up provider_event_id in webhook_events
      already present → return 200, do nothing        → deduplication
5. BEGIN
     insert webhook_events + payment_events
     SELECT … FOR UPDATE on the order row
     update payment_intents.status (guarded by current status)
     update orders.status via the order state machine
     enqueue fulfillment job if now PAID
     insert audit_logs rows
   COMMIT
6. Return 200
```

Rules:

- **Signature verification uses the raw body.** A framework that parses JSON
  first and re-serialises will produce a different byte sequence and fail
  legitimate webhooks or, worse, be made to pass forged ones.
- **Return 200 once accepted, including for duplicates.** A non-2xx makes the
  provider retry, and providers retry aggressively.
- **Never trust the payload's amount alone.** Compare against the intent's
  stored amount; a mismatch is an alert, not an update.
- Processing must be idempotent even if step 4 races: the unique constraint on
  `(provider, provider_event_id)` is the real guard.
- Webhooks arriving **before** the confirm response is a normal ordering. The
  order state machine must accept `PAYMENT_PROCESSING → PAID` from either path.

## 6. Client flow

Already implemented against this design:

```
Checkout details validated
        │
        ▼
POST /payment/intents      Idempotency-Key: payment-intent:{checkoutSessionId}
        │  ← intent { status: REQUIRES_ACTION, action }
        ▼
Render the action
   REDIRECT → send the customer to action.url
   CONFIRM  → show the prompt and a confirm button
        │
        ▼
POST /payment/intents/{id}/confirm   Idempotency-Key: payment-confirm:{intentId}
        │
        ├── SUCCEEDED  → navigate to /order/{id}/success
        ├── PROCESSING → "do not pay again", poll GET /payment/intents/{id}
        └── FAILED / CANCELLED → show the reason, offer a retry
                                  (a retry opens a NEW intent)
```

Client-side protections, all verified by browser tests:

- The Pay button is disabled while a request is in flight.
- The facade refuses re-entry while busy.
- A settled intent is cleared, so a retry cannot re-confirm a spent one.
- A pending payment disables Pay entirely and offers "check status" instead.
- Order creation and payment intent creation are keyed by checkout session, so a
  double-click cannot produce two orders or two intents.

## 7. The simulator

`MockPaymentApiService` is a development tool that models the real machine. It
is selected only when `apiMode = 'mock'`, its descriptor is flagged
`simulated: true`, and the checkout UI labels it as a simulation.

Branches are chosen by an opaque instrument token, exactly as a gateway's test
cards work — nothing is random, so every branch is reproducible in a test:

| Token | Outcome |
|---|---|
| `sim_success` | `SUCCEEDED`, order advances to fulfillment |
| `sim_declined` | `FAILED`, issuer decline, retryable |
| `sim_cancelled` | `CANCELLED` |
| `sim_error` | `FAILED`, gateway error, retryable |
| `sim_timeout` | Stays `PROCESSING` — exercises the pending path |

**When a real provider is integrated, these tokens must not exist in
production.** The simulator adapter is registered only in non-production
configuration.

## 8. Refunds

Not implemented in the frontend; specified so the backend can be built once.

```
Operator or support action
        │
        ▼
POST /admin/orders/{id}/refunds   { amountMinor, reason }
        │  guard: amountMinor + orders.refunded_minor <= orders.total_minor
        ▼
provider.refund(...)  with an idempotency key
        │
        ▼
refunds row → PENDING → webhook → SUCCEEDED
        │
        ▼
orders.refunded_minor += amount
orders.status → REFUND_PENDING → REFUNDED (or PARTIALLY_REFUNDED)
audit_logs entry with the operator id
```

A refund never exceeds the captured amount — enforced by
`orders_refund_within_total`. A delivered digital code is generally
non-refundable; the customer-facing rule is in `/refund-policy` and **needs
legal review**.

## 9. Money handling

- Always `{ amountMinor, currency }`. No floats anywhere in the pipeline.
- The **backend** computes `base − discounts + fees + taxes = total`. The
  frontend displays the result and performs no commercial arithmetic beyond
  multiplying a server-supplied unit price by a quantity for display.
- The amount charged comes from the **checkout session's frozen snapshot**, not
  from the request body and not from a live catalog read.
- Currency is asserted equal at every hop: session → order → intent → refund.

**VAT is not modelled yet.** Israeli VAT treatment of digital goods, and whether
displayed prices are VAT-inclusive, must be settled with an accountant before
launch; the schema has room (`fees`, `taxes` in the snapshot) but no logic.

## 10. Testing

| Level | Cases |
|---|---|
| Unit | State transitions, amount/currency assertions, idempotency key derivation, error mapping |
| Integration | Provider sandbox: success, decline, 3DS challenge, timeout, refund, partial refund |
| Webhook | Valid signature, **forged signature**, replayed event, out-of-order arrival, unknown event type, malformed body |
| E2E | Full purchase, decline then retry, cancel, pending-then-settled, double-click, refresh mid-payment |
| Security | Confirm someone else's intent (IDOR), amount tampering, webhook forgery, replay |

The simulator already covers the success, decline, cancel, error, pending,
retry and double-click cases in the browser suite.
