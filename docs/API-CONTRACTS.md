# Top Token — API Contracts

The contract the frontend already consumes through `src/app/data/api/*`. The mock
implementations in `src/app/data/mock/` satisfy exactly these shapes, so replacing
them with HTTP implementations should require no UI change.

**Status: specification only.** No backend exists. Nothing in this document is
implemented server-side.

## Conventions

| Topic | Rule |
|---|---|
| Base URL | `environment.apiBaseUrl` (`/api`) |
| Transport | JSON over HTTPS |
| Money | `{ "amountMinor": 5200, "currency": "ILS" }` — integer minor units, never a float |
| Localized text | `{ "he": "...", "en": "..." }`; `he` required, `en` optional |
| Timestamps | ISO-8601 UTC strings |
| Ids | Opaque strings. The client never parses or constructs them |
| Paging | Request `?page=1&pageSize=12`; response `{ items, page, pageSize, total, hasMore }` |
| Errors | See **Error envelope** below |
| Auth | Bearer token in `Authorization`. Anonymous where marked; the token is held in memory, never in `localStorage` |
| Idempotency | Mutating endpoints that create money-bearing records accept `Idempotency-Key` |

### Error envelope

Every non-2xx response uses one shape, which maps directly onto the client's
`AppError`:

```json
{
  "kind": "VALIDATION",
  "code": "REGION_NOT_CONFIRMED",
  "message": "Region confirmation is required for a region-locked offer",
  "userMessage": { "he": "יש לאשר את אזור החנות כדי להמשיך.", "en": "Please confirm the store region to continue." },
  "fieldErrors": [
    { "field": "REGION_CONFIRMATION", "message": { "he": "יש לאשר כדי להמשיך." } }
  ],
  "retryable": false
}
```

- `kind` ∈ `API | VALIDATION | PAYMENT | FULFILLMENT | NETWORK | NOT_FOUND | UNKNOWN`
- `message` is for logs. **`userMessage` is the only field ever rendered.**
- The server must never return a stack trace, a SQL fragment, a provider payload
  or a gateway response code in any field.

### Loading behaviour

Every operation below is consumed through a facade that renders a skeleton while
in flight, an error state on failure with a retry where `retryable` is true, and
an empty state when a collection comes back empty. There is no operation whose
failure is allowed to leave a blank screen.

---

## 1. Catalog

### `GET /games`
- **Auth** none · **Idempotency** n/a · **Cache** long, immutable per deploy
- **Response** `Game[]` — `{ id, slug, name, publisher, shortDescription, platformIds[], accentColor?, active, featured, sortOrder }`
- **Business errors** none. An empty list is valid and renders an empty state.

### `GET /games/{slug}`
- **Response** `Game`
- **Errors** `404 NOT_FOUND` when the slug is unknown or the game is inactive.

### `GET /platforms`, `GET /regions`
- **Response** `Platform[]` / `Region[]`
- `Region` carries `code`, `currency`, `isRegionFree` and `restrictionNotice`.
  **`restrictionNotice` is required for every region where `isRegionFree` is
  false** — the UI shows it verbatim before purchase.

### `GET /catalog/facets`
- **Response** `{ gameIds[], platformIds[], regionIds[], types[], tags[], minPriceMinor, maxPriceMinor }`
- Drives the filter bar. Must reflect only currently purchasable inventory.

### `GET /products`
- **Query** `search, gameIds[], platformIds[], regionIds[], types[], tags[], minPriceMinor, maxPriceMinor, featuredOnly, sort, page, pageSize`
- `sort` ∈ `relevance | price-asc | price-desc | name-asc | newest | popular`
- **Response** `Page<Product>`; each `Product` includes `fromPrice` — the cheapest
  current offer — so a grid renders from one request.
- **Validation** unknown filter values are ignored, not rejected; a bad `page`
  returns `400 VALIDATION`.

### `GET /products/{slug}`
- **Response** `{ product, offers }`
- `offers` is every active offer for the product: one per (variant × platform ×
  region), each with its own `price`, `inventory`, `fulfillmentMethod`,
  `checkoutRequirements` and `terms`.
- **Errors** `404 NOT_FOUND`.

### `GET /offers/{offerId}`
- **Response** `Offer` · **Errors** `404 NOT_FOUND`.

### `GET /products/{slug}/related?limit=4`
- **Response** `Product[]`. Never errors; returns `[]` when there is nothing.

---

## 2. Cart

The cart lives in the browser for anonymous users. **The server is authoritative
for price and availability**; the client copy is display state only.

### `POST /cart/items`
- **Auth** anonymous · **Idempotency** not required (client de-duplicates by offer)
- **Request** `{ "offerId": "...", "quantity": 2 }`
- **Response** a complete `CartItem`, priced by the server. The client must not
  construct a cart line itself.
- **Validation** `quantity >= 1`; quantity above `inventory.maxPerOrder` is
  clamped and the clamped value returned.
- **Business errors** `404 NOT_FOUND` (offer gone), `409 OFFER_UNAVAILABLE`
  (inactive or `NOT_SUPPORTED` fulfillment).

### `POST /cart/validate`
- **Request** `{ items: CartItem[], couponCode? }`
- **Response** `{ cart, issues[], valid }`
- **Contract:** the server **re-derives every unit price from the catalog** and
  ignores the submitted prices. Issue codes: `OFFER_UNAVAILABLE`, `PRICE_CHANGED`,
  `QUANTITY_REDUCED`, `OUT_OF_STOCK`, `COUPON_INVALID`. Each carries a
  `userMessage`.
- Called before checkout and again server-side at order creation. A client that
  skips it must not be able to obtain a cheaper order.

### `POST /cart/coupon`
- **Request** `{ items, code }` → **Response** `{ applied, code, discount, message }`
- A rejected coupon is a **200 with `applied: false`**, not an error: an invalid
  code is a normal outcome, not a failure.

---

## 3. Checkout

### `POST /checkout/session`
- **Auth** anonymous · **Request** `{ cart }`
- **Response** `CheckoutSession` — `{ id, cart, requirements[], availableProviders[], step, values, expiresAt }`
- **`requirements` is the heart of the contract.** The server returns the union of
  the base contact fields and every requirement declared by the offers in the
  cart. The client renders exactly what it is given and nothing else.
- **`requirements[].key` must come from a fixed vocabulary**: `EMAIL`,
  `FULL_NAME`, `PHONE`, `REGION_CONFIRMATION`, `PLATFORM_ACCOUNT_HANDLE`,
  `GAME_PLAYER_ID`, `PLATFORM_SELECTION`, `SERVICE_NOTE`, `TERMS_ACCEPTANCE`.
  **A server that returns any other key — in particular anything resembling a
  password, verification code or recovery code — must be treated as compromised;
  the client will not render it.**
- **Errors** `400 VALIDATION` for an empty cart; `409` if any line is unavailable.

### `GET /checkout/session/{id}` — `CheckoutSession` · `404` when expired.

### `POST /checkout/session/{id}/details`
- **Request** `{ values: { [CheckoutFieldKey]: string | boolean } }`
- **Response** `{ session, issues[], orderId? }`
- **Validation is server-side and authoritative.** Required fields, max lengths,
  email format and required checkboxes are re-checked regardless of what the
  client allowed. `issues[].field` matches a requirement key so the UI can mark
  the control.
- Returns **200 with a non-empty `issues[]`** for a failed validation — this is an
  expected outcome, not an exception.

---

## 4. Payment

Provider-agnostic. **No endpoint accepts card data.** PAN, expiry and CVV are
entered in the provider's hosted field or on the provider's own page; this API
sees only an opaque instrument token.

### `POST /payment/session`
- **Request** `{ checkoutSessionId, provider }`
- **Response** `{ intent, availableProviders[], instruments? }`
- `intent` = `{ id, orderId, provider, amount, status, action, clientToken?, createdAt, updatedAt }`
- `action` ∈ `{ kind: "REDIRECT", url } | { kind: "CONFIRM", prompt } | { kind: "NONE" }`
- `clientToken` may only ever be a **publishable** provider key. A secret key in
  this field is a security incident.
- `instruments` is populated **only** for a provider flagged `simulated`; a real
  provider returns it absent.
- **Contract:** if an unsettled intent already exists for the order, return that
  intent rather than creating a second one. This is what makes a double-clicked
  Pay button safe.
- **Business errors** `409 ORDER_ALREADY_PAID`; `400 PROVIDER_NOT_ENABLED`.

### `POST /payment/intents/{id}/confirm`
- **Request** `{ instrument: { token } }` · **Header** `Idempotency-Key` required
- **Response** `PaymentResult` = `{ intentId, status, orderId, failureReason? }`
- `status` ∈ `CREATED | REQUIRES_ACTION | PROCESSING | SUCCEEDED | FAILED | CANCELLED`
- **Must be idempotent by intent id**: confirming an already-settled intent
  returns the settled result and charges nothing further.
- **`PROCESSING` is a real outcome**, not an error — the client shows a
  "still processing, do not pay again" state and polls.
- `failureReason` is a `userMessage`-grade string. Never a gateway decline code.
- **The client never decides that a payment succeeded.** Order state changes only
  because the server said so.

### `POST /payment/intents/{id}/cancel` — `PaymentResult`, idempotent.
### `GET /payment/intents/{id}` — `PaymentResult`, used for polling a pending payment.

### Webhooks (server-side, listed for completeness)
`POST /webhooks/payments/{provider}` — signature-verified, idempotent by provider
event id. This, not the browser, is what moves an order to `PAID`.

---

## 5. Orders

### `POST /orders`
- **Request** `{ checkoutSessionId }` · **Header** `Idempotency-Key` required
- **Response** `Order`
- **Contract: one checkout session yields exactly one order.** A repeat call
  returns the existing order with 200. This is the duplicate-order guard.
- `Order` = `{ id, reference, customerId?, contactEmail, status, items[], totals, fulfillments[], payment?, checkoutValues, couponCode?, createdAt, updatedAt, statusMessage? }`
- `status` ∈ `DRAFT | PENDING_PAYMENT | PAYMENT_PROCESSING | PAID | PROCESSING | FULFILLMENT_PENDING | FULFILLMENT_PROCESSING | FULFILLED | FAILED | CANCELLED | REFUND_PENDING | REFUNDED`
- **Errors** `400 VALIDATION` (session has no contact email), `404` (unknown session),
  `409` (cart no longer valid — the server re-validates at this point).

### `GET /orders/{id}` — `Order`
- **Auth** the owning customer, or an anonymous holder of the order's signed
  access token from the confirmation email. **An order id alone must not be
  sufficient**: ids are guessable enough that enumeration would leak addresses.

### `GET /orders/{id}/status`
- **Response** `{ orderId, status, fulfillments[], updatedAt, statusMessage? }`
- Deliberately smaller than the full order because the client polls it every
  2.5s until the status is terminal. Should be cheap and cacheable for ~1s.

### `GET /orders` — `Order[]` for the authenticated customer, newest first.

---

## 6. Fulfillment

### `GET /fulfillment/descriptors`
- **Response** `FulfillmentDescriptor[]` — `{ method, label, description, etaMinutesMin?, etaMinutesMax?, automated, requiresCustomerAction }`
- **Contract: the ETA fields are a promise.** Omit them rather than guess. The UI
  renders no delivery estimate when they are absent, which is correct.
- `method` ∈ `DIGITAL_CODE | AUTOMATED_API | MANUAL_REVIEW | MANUAL_DELIVERY | IN_GAME_SERVICE | NOT_SUPPORTED`.
  `AUTOMATED_API` may only be returned for a method with a live supplier
  integration behind it.

### `GET /orders/{id}/fulfillments`
- **Response** `Fulfillment[]` — `{ id, orderId, orderItemId, method, status, updatedAt, estimatedReadyAt?, delivery?, failureReason? }`
- `status` ∈ `PENDING | PROCESSING | WAITING_FOR_CUSTOMER | READY | DELIVERED | FAILED | CANCELLED | REFUNDED`
- **`delivery.payload` must be withheld until the order is paid.** A code returned
  before payment is a code given away.
- Payload kinds: `CODE` (`{ code, redeemUrl? }`), `INSTRUCTIONS`, `IN_GAME`, `NONE`.

---

## 7. Customer

**There is no password in this API and there must never be one.**

### `POST /auth/email-link`
- **Request** `{ email }` → **Response** `204`
- **Always returns 204**, whether or not the address exists, so the endpoint
  cannot be used to enumerate customers. Rate-limited per address and per IP.

### `POST /auth/email-link/verify`
- **Request** `{ token }` → **Response** `{ customer, accessToken, expiresIn }`
- The token is single-use and short-lived. The access token is held in memory by
  the client and **never written to `localStorage` or a URL**.

### `GET /customers/me` — `AuthState`
### `PATCH /customers/me` — `{ displayName?, phone?, preferredLocale?, preferredRegion? }` → `Customer`
### `POST /auth/logout` — `204`, revokes the token server-side.

---

## 8. Promotions, reviews, support

### `GET /promotions` — `Promotion[]` (active only)
### `GET /reviews?productId&page&pageSize` — `Page<Review>`
### `GET /reviews/summary?productId` — `{ average, count, distribution[5] }`
- **Contract:** only reviews attached to a fulfilled order may carry
  `verifiedPurchase: true`. The UI shows that badge as a trust signal, so the
  server must earn it.

### `GET /faq` — `FaqEntry[]`
### `POST /support/tickets`
- **Request** `{ topic, contactEmail, subject, message, orderReference? }`
- **Response** `SupportTicket` with a human reference
- **Validation** message length capped server-side; content is treated as
  untrusted and never rendered as HTML.
- Rate-limited. Spam rejection returns `429`, not a silent 200.

---

## 9. What the client already guarantees

These hold today against the mock and are verified by the test suite, so a real
backend can rely on them:

1. No component calls HTTP directly; everything goes through an abstraction.
2. The client never invents a price — cart lines are built server-side.
3. The client never marks an order paid on its own.
4. The client renders only requirement keys from the fixed vocabulary.
5. Order and payment ids are treated as opaque.
6. Every collection response has an empty state; every failure has an error state
   with a retry where the error is retryable.

## 10. Missing contracts

Not specified yet, because no screen consumes them:

- Refunds and cancellations initiated by the customer (`POST /orders/{id}/cancel`,
  `POST /orders/{id}/refund-request`)
- Review submission (`POST /reviews`) — the store only reads reviews today
- Address/invoicing data for Israeli tax receipts
- Stock reservation during checkout (today's model re-checks at order time
  instead of holding inventory)
- Admin/operator endpoints for manual fulfillment
- Multi-currency: the model supports it, every endpoint currently assumes ILS
