# EASYCOINS: architecture report

Companion to `ARCHITECTURE-AUDIT.md`, which describes the codebase this replaced.
Updated in Phase 3 with the HTTP data layer; see `docs/README.md` for the full
document set.

## 1. Shape of the system

```
UI (standalone page + presentational components)
        ↓  reads signals / observables, emits intents
Facade  (CartFacade, CatalogFacade, CheckoutFacade, OrderFacade, CustomerFacade)
        ↓  depends only on abstract API classes
API boundary  (CatalogApiService, CartApiService, … — abstract classes = DI tokens)
        ↓  bound in exactly one file: data/providers.ts
Implementation  (Mock* today, Http* later)
```

Three rules hold the layering together:

1. **No component injects an API service for mutations.** Pages may read through a
   facade or, for pure content reads (FAQ, reviews, promotions), call the API
   abstraction directly — never an implementation.
2. **`data/providers.ts` is the only file that names a `Mock*` class.** Swapping in
   a real backend is an edit to that file plus the new HTTP classes.
3. **The domain layer has zero Angular imports.** It is plain TypeScript, so it can
   move to a shared package with the backend later without modification.

## 2. Folder structure

```
src/
  app/
    domain/           pure types, enums and pure functions — no Angular
      common/         Money, ids, LocalizedText, Page, ImageAsset
      catalog/        Game, Platform, Region, Product, ProductVariant, Offer, Inventory, CatalogQuery
      fulfillment/    FulfillmentMethod, FulfillmentStatus, Fulfillment, Delivery
      cart/           Cart, CartItem, CartTotals, validation results, pure pricing
      checkout/       CheckoutRequirement / CheckoutFieldKey, CheckoutSession
      payment/        PaymentProviderId, PaymentIntent, PaymentStatus, PaymentResult
      order/          Order, OrderItem, OrderStatus, ORDER_STATUS_FLOW
      customer/       Customer, AuthState
      marketing/      Promotion, Coupon
      social/         Review, ReviewSummary
      support/        SupportTicket, FaqEntry, SupportTopic
      errors/         AppError + typed constructors
    data/
      api/            abstract API classes (the boundary)
      mock/           seed data + in-memory implementations
      http/           REST client for docs/API-CONTRACT.md
        dto/          wire types — nothing outside mappers/ may import these
        mappers/      DTO -> domain, with safe enum coercion and defaults
      providers.ts    the single binding point, switched by environment.apiMode
    state/            facades + cart local persistence
    core/             logger, analytics, i18n, error handling, toasts
    ui/               design-system components and pipes
    pages/            one lazy-loaded standalone component per route
    app.routes.ts     routing map
  styles/
    _tokens.scss      design tokens (colour, space, radius, elevation, motion, type)
    _base.scss        reset + primitives (buttons, inputs, cards, badges, alerts, skeletons)
  environments/       environment.model.ts + development / default / production
```

## 3. Domain model

FIFA is now one row of data. `PRODUCT_SEEDS` in `data/mock/catalog.seed.ts` carries
five games (EA SPORTS FC, PlayStation, Fortnite, Call of Duty, NBA 2K) across seven
product types, and adding a sixth game requires no code change anywhere.

The load-bearing decisions:

- **Offer, not Product, is the unit of commerce.** An `Offer` is `(variant × platform
  × region)` with its own price, inventory, fulfillment method and checkout
  requirements. The cart, checkout and orders all reference offers.
- **Region is first-class** on every offer, rendered on the product card, the product
  page, the cart line and the checkout summary, and confirmed explicitly before a
  region-locked purchase.
- **Money is minor units** (`{ amountMinor, currency }`) with pure arithmetic helpers,
  so no float drift and no currency mixing.
- **All customer-visible strings in the domain are `LocalizedText`** (`{ he, en? }`),
  resolved through the `| t` pipe. Hebrew is required, English optional.
- **`ProductMetadata` is an open bag** for type-specific attributes (coin amount, card
  denomination), so the platform layer never learns what a coin is.

## 4. Services

| Abstraction | Mock implementation | Purpose |
|---|---|---|
| `CatalogApiService` | `MockCatalogApiService` | games, platforms, regions, facets, product search |
| `ProductApiService` | `MockProductApiService` | product detail, offers, related products |
| `CartApiService` | `MockCartApiService` | build a line from an offer, re-price a cart, apply a coupon |
| `CheckoutApiService` | `MockCheckoutApiService` | session creation, requirement resolution, validation |
| `PaymentApiService` | `MockPaymentApiService` | provider-agnostic intents; **simulator only** |
| `OrderApiService` | `MockOrderApiService` | order creation, retrieval, status |
| `FulfillmentApiService` | `MockFulfillmentApiService` | delivery-method descriptors and fulfillments |
| `CustomerApiService` | `MockCustomerApiService` | auth state, passwordless sign-in request |
| `PromotionApiService` / `ReviewApiService` / `SupportApiService` | mocks | promotions, reviews, FAQ, tickets |

Facades: `CartFacade` (signals + local persistence + server re-pricing),
`CatalogFacade` (shared reference-data lookups), `CheckoutFacade` (the flow),
`OrderFacade`, `CustomerFacade`.

Cross-cutting: `LoggerService` (silent in production), `AnalyticsService` (all
thirteen events, with a key blocklist that strips contact and payment data),
`LocaleService` + `LocalizePipe`, `GlobalErrorHandler`, `NotificationService` /
`ToastService`.

## 5. Routing map

| Route | Page | Notes |
|---|---|---|
| `/` | Home | hero, featured products, games, promos, reviews, FAQ |
| `/store` | Store | filters from domain data; `/products` redirects here |
| `/games` | Games | game directory |
| `/games/:gameSlug` | Game detail | that game's products |
| `/products/:productSlug` | Product detail | variant × platform × region → offer |
| `/products/:productSlug/:variantId` | Product detail | deep link to a variant |
| `/cart` | Cart | region + delivery repeated per line, coupon |
| `/checkout` | Checkout | `cartNotEmptyGuard`; dynamic form; payment |
| `/order/:orderId` `…/success` `…/status` | Order status | timeline + delivered payload |
| `/account`, `/account/orders`, `/account/order/:orderId` | Account | passwordless sign-in, history |
| `/support`, `/contact` | Support | ticket form + FAQ excerpt |
| `/faq`, `/reviews`, `/deals` | Content | real data from the API |
| `/about`, `/terms`, `/privacy`, `/refund-policy`, `/accessibility` | Legal | one component, content records |
| `**` | Not found | real 404 page |

Every route is lazy-loaded and renders real content. Preloading is enabled, so the
first in-app navigation is instant.

## 6. Security posture

- The checkout requirement vocabulary (`CheckoutFieldKey`) contains **no credential
  member**. There is no password, no 2FA code and no recovery code, so the dynamic
  form is structurally incapable of asking for one.
- The `psnId`-for-everyone field is gone. Account handles are requested only by the
  offers whose fulfillment actually needs one, and are labelled "public username,
  never a password".
- `PaymentPayload` with `cardNumber` / `cvv` is deleted. No payment method accepts
  card data; the simulator is the only enabled provider and is labelled as a
  simulation in the UI, the footer and the FAQ.
- `localStorage` holds the anonymous cart only, and every field is validated on read.
  No contact details, checkout answers or orders are persisted client-side.
- Prices are re-derived server-side by `CartApiService.validate()` before checkout.
- `LoggerService` is silent in production; the ~30 order-and-payment `console.log`
  calls are gone. `AnalyticsService` strips blocked keys from every payload.
- Customers never see a stack trace: `GlobalErrorHandler` renders `AppError.userMessage`.

## 7. Remaining technical debt

1. **No tests.** Zero spec files, as before. The highest-value first targets are the
   pure ones: `computeTotals`, `Money` arithmetic, `requirementsForCart`,
   `validateCheckoutValues` and `CartStorageService`'s hostile-input parsing.
2. **No backend.** The HTTP client exists and is complete (Phase 3), but there is
   no server implementing `docs/API-CONTRACT.md`. `environment.apiMode` is
   `mock` in every shipped configuration; `staging` is wired to `http` and builds,
   but points at a host that does not exist yet.
3. **Order state is in-memory.** The mock backend loses orders on reload, so
   `/account/orders` is empty after a refresh. The account page says so; a real
   backend fixes it.
4. **Authentication is not implemented.** `requestEmailSignIn` records the request
   and nothing else; `MockCustomerApiService` never authenticates anyone, and there
   is no route guard for account pages yet.
5. **i18n is half-built.** The plumbing (`LocalizedText`, `LocaleService`, `| t`,
   logical CSS) is in place and RTL is correct, but page-level copy is still Hebrew
   literals in templates. An English build needs those extracted.
6. **Legal copy is a developer draft.** Each policy page says so on the page itself.
   It must be reviewed by a lawyer before real money moves.
7. **Accessibility is unverified.** Structure, focus, skip link, reduced motion and
   contrast were designed for; no screen-reader pass or Israeli-standard 5568 audit
   has been run.
8. **Images are placeholders.** Products reuse two existing assets. Real product
   imagery and an `ImageAsset` set per role (card/hero/gallery) are outstanding.
9. **Coupon/promotion logic is simplistic** — one coupon, whole-cart discounts only,
   no per-product targeting despite the model supporting it.
10. **Angular 16.** Worth moving to a current release for the modern control flow and
    `@defer`; the standalone/signals migration done here makes that upgrade small.

## 8. Recommended next phase

**Phase 12 first, not last: tests around the money and requirement logic.** They are
pure functions, they are where a real bug costs real money, and they cost hours.

Then, in order:

1. The backend itself, built against `docs/API-CONTRACT.md`. The client half is
   done; the architecture's central claim stays unproven until a real server
   answers it.
2. A real backend for orders and fulfillment, which unlocks the account area.
3. Passwordless authentication and a guard for `/account/*`.
4. A payment provider, replacing the simulator behind the existing abstraction.

Do not skip ahead to more pages. The pages are the cheap part now; the boundary is
what has to be proven.

## 9. Honest status

The application compiles, `ng serve` runs, the production build passes its budgets,
every route renders real content and no route collects a credential. **It is not
production-ready.** It has no tests, no backend, no authentication and no payment
provider, and its legal pages have not been reviewed. Compilation is the floor, not
the finish line.
