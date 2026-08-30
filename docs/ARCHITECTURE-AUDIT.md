# Top Token: Phase 1 architecture audit

Snapshot of the repository **before** the architecture rebuild (commit `206554f`).

## 1. Baseline facts

| Item | Value |
|---|---|
| Angular | 16.2 (NgModule bootstrap, `platformBrowserDynamic`) |
| TypeScript | 5.1, `strict: true`, `strictTemplates: true` |
| UI kit | Angular Material 16 + CDK, prebuilt indigo-pink theme |
| State | Hand-rolled `BehaviorSubject` in `CartService` |
| HTTP | `HttpClientModule`, one service reading `assets/mock-packages.json` |
| Tests | Karma/Jasmine installed, `skipTests: true` everywhere, so **zero spec files** |
| Source size | ~3.6k LOC, 1.27k of which are two SCSS files |
| Build | `ng build` succeeds; initial bundle 3.59 MB (dev) |

## 2. Structure as found

- `src/app/core/`: `AuthService` (empty stub), `TokenService`, `CartService`, `PaymentService`, `models.ts`
- `src/app/core.module.ts` **and** `src/app/core/core.module.ts` are two different `CoreModule` classes; the app imports the empty one, so `core/core.module.ts` is dead code
- `src/app/shared.module.ts` + `src/app/shared/`: `HeaderComponent`, `TokenCardComponent`
- `src/app/features/`: `catalog` (+ nested `package-detail`), `cart`, `checkout`, `order-confirmation`, `package`, `user`
- `src/assets/mock-packages.json` (6 FIFA coin bundles), `mock-tokens.json` (FIFA player cards, unused)

## 3. Findings

### 3.1 Dead / unreachable code
- `src/app/core.module.ts` is an empty `NgModule` shadowing the real one; `CoreModule` in `core/core.module.ts` is never imported, so its `AuthService`/`TokenService`/`CartService`/`PaymentService` providers never run (the services survive only because each is also `providedIn: 'root'`).
- `features/package/` is a full module whose template is literally `<p>package works!</p>`. Its route is unreachable, because `app-routing` redirects `package/:id` into the catalog module, and `PackageModule` is never lazy-loaded.
- `features/user/` template is `<p>user works!</p>`, the Angular starter placeholder, reachable at `/user`. **Violates "no Angular starter content".**
- `mock-tokens.json` and the `Player` interface model a FIFA player-card marketplace that no screen implements.
- `TokenCardComponent` is declared and exported by `SharedModule` but used in no template.
- `assets/logo-ps5.png` is referenced by the header and **does not exist**, so every page shows a broken image.
- `header.component.html` uses `fxLayout` / `fxLayoutAlign`; Flex-Layout is not a dependency, so these attributes are inert.

### 3.2 Duplicate logic
- `features/package/package.component.ts` and `features/catalog/package-detail/package-detail.component.ts` both load a package by id and navigate to checkout; only the second is reachable.
- Navigate-then-toast error handling is copy-pasted in `HeaderComponent` (3×), `PackageComponent`, `CatalogComponent`, `CheckoutComponent`.
- `CartService.getCartTotal()` and the `total` getters in `CartComponent`/`CheckoutComponent` each recompute the same sum independently.

### 3.3 Tight coupling / backend-integration blockers
- **Components call data services directly.** `CatalogComponent` injects `TokenService`; `CheckoutComponent` injects `PaymentService` and `CartService`. With no facade layer, every UI change touches data code and vice versa.
- **`TokenService` hard-codes `assets/mock-packages.json`.** The UI's data shape *is* the JSON file's shape, and `TokenPackage` fields (`amount`, `platform: string`) leak into templates. Swapping in a backend means rewriting the service and every consumer.
- **`CartService` mutates state in place** (`existingItem.quantity += …`) before emitting, so the `BehaviorSubject` re-emits the same array reference, so `OnPush` change detection would not fire.
- **`HeaderComponent.cartCount` is a getter** that hits the service (and `console.log`s) on every change-detection cycle instead of consuming `cart$`.
- **`CatalogComponent` injects `ChangeDetectorRef`** and calls it manually, a symptom of imperative loading rather than the `async` pipe.
- No `HttpInterceptor`, no auth plumbing, no global `ErrorHandler`. There is nothing to hang a real backend on.

### 3.4 FIFA-only assumptions (blocks multi-game)
- `TokenPackage { amount, platform: string }` is the *only* product model. No product type, variant, region, currency, fulfillment method, or inventory.
- `CartItem.productType` is the literal type `'tokenPackage'`, a one-value union. A second product category does not typecheck.
- `CatalogComponent.amountRange` filters on hard-coded coin buckets `'0-250k' | '250k-1m' | '1m+'`; gift cards and subscriptions have no "amount".
- `platform` is a free-form `string` compared against `'PlayStation'` literals harvested from the data at runtime. There is no typed platform domain.
- Naming encodes FIFA coins into the platform layer: `TokenService`, `token-card`, `getPackages`, `fifa-coin.png`, `/catalog/package/:id`.
- `index.html` title: `TopToken - טוקנים ל-FIFA`.

### 3.5 Region is entirely absent
No region concept anywhere. For PlayStation Store vouchers this is the most expensive omission: a customer can buy an IL voucher for a US account with no signal. Region must be first-class on the offer and shown before checkout.

### 3.6 Fulfillment is entirely absent
Delivery promises live in free-text Hebrew inside `description` ("אספקה מיידית"). There is no fulfillment method, no fulfillment status, and no delivery record, so there is no honest way to distinguish "instant code" from "manual service, 5–30 minutes".

### 3.7 Security problems
1. **PSN ID is collected unconditionally at checkout.** `psnId` is `Validators.required` for every product, wrong for gift cards and demanded before any product actually needs it.
2. **`PaymentPayload` declares `cardNumber`, `expiryDate`, `cvv`** in a frontend model. Raw PAN/CVV must never enter application code; the shape invites a PCI violation even though nothing renders it today.
3. **Prices are frontend-authoritative.** Totals are computed from `localStorage` values a user can edit in DevTools; nothing revalidates server-side.
4. **Cart persistence is unvalidated.** `JSON.parse` output is cast straight to `CartItem[]`, so tampered or malformed data flows into the UI.
5. **~30 `console.log` calls ship in production**, logging cart contents and payment flow.
6. `Math.random() < 0.8` payment simulation lives behind the same `PaymentService` name a real provider would use, so nothing marks it as a fake integration.

### 3.8 RTL blockers
`index.html` correctly sets `lang="he" dir="rtl"`, but the SCSS does not follow:
- `catalog.component.scss` / `package-detail.component.scss` use physical properties: `margin-left`, `padding-right`, `left:`, `text-align: left`, `transform: translateX(...)`, `border-left`.
- Direction-dependent values are baked into keyframes and hover transforms, so mirroring is not a matter of flipping a flag.
- Hebrew strings are hard-coded in ~40 template locations with no i18n mechanism, so English is currently impossible.

### 3.9 UX problems
- `/user` and `/package/:id` render starter text.
- The "טען עוד חבילות" (load more) button has **no click handler**, so it does nothing.
- The quick-view (eye) button and the buy button both call `onBuyNow`, so two affordances share one behaviour.
- No skeletons; a spinner replaces the whole page on every load.
- No route for FAQ, support, reviews, terms, privacy, refunds, or accessibility, all of which are effectively mandatory for an Israeli consumer store.
- `anyComponentStyle` budget is 4 kB; `catalog.component.scss` (614 lines) will breach it as it grows.

### 3.10 Configuration
`environment.ts` and `environment.development.ts` are both `export const environment = {}`, with no `apiBaseUrl` and no feature flags. There is no `environment.production.ts`; production reuses the base file.

## 4. Verdict

The codebase is a competent single-purpose FIFA-coin catalog demo. Nothing in it is reusable as a *platform* layer, because the platform layer does not exist: components talk to a JSON file through a FIFA-named service. The rebuild therefore introduces a domain layer, an API boundary, and facades **beneath** the screens rather than restyling them.
