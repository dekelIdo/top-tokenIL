# EASYCOINS: database design

Conceptual relational schema for PostgreSQL. **No migrations exist and none
should be written in this phase.** This is the contract; the next phase turns it
into migrations.

DDL below is illustrative — enough to be unambiguous about keys, constraints and
indexes, not a copy-paste migration.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Ids | `TEXT` primary keys holding prefixed, high-entropy ids (`ord_01J9…`). Sortable ULIDs are fine; sequential integers are **not** — order ids are used as capabilities |
| Money | Two columns: `*_amount_minor BIGINT` + `*_currency CHAR(3)`. Never `FLOAT`, never a single scaled column |
| Localized text | `JSONB` as `{"he": "...", "en": "..."}` |
| Timestamps | `TIMESTAMPTZ`, always UTC. `created_at`, `updated_at` on every table |
| Soft delete | Only where a catalog row must survive for historical orders: `active BOOLEAN` |
| Enums | Postgres `CHECK` constraints over `TEXT`, not native `ENUM` types — adding a value is then a constraint change, not a type migration with a table rewrite |
| Snapshots | `JSONB`, deliberately denormalised, immutable once written |

---

## 2. Entity map

```
customers ──┬── customer_sessions
            ├── auth_codes
            ├── carts ── cart_items
            ├── checkout_sessions ── checkout_items
            ├── orders ──┬── order_items ── fulfillments ── fulfillment_events
            │            ├── payment_intents ── payment_events
            │            └── refunds
            ├── reviews
            └── support_tickets

games ── products ── product_variants ── offers ──┬── inventory
                                                  └── inventory_reservations
platforms ─┘   regions ─┘

promotions ── coupons ── coupon_redemptions
audit_logs (references everything, owns nothing)
idempotency_keys
webhook_events
```

---

## 3. Catalog

```sql
CREATE TABLE games (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  name              JSONB NOT NULL,
  publisher         TEXT NOT NULL,
  short_description JSONB NOT NULL,
  accent_color      TEXT,
  cover_url         TEXT,
  hero_url          TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT games_slug_unique UNIQUE (slug)
);

CREATE TABLE platforms (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN
               ('PLAYSTATION_5','PLAYSTATION_4','XBOX','PC','MOBILE','MULTI_PLATFORM')),
  family     TEXT NOT NULL CHECK (family IN ('PLAYSTATION','XBOX','PC','MOBILE','ANY')),
  name       JSONB NOT NULL,
  short_name JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE regions (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL CHECK (code IN ('IL','US','UK','EU','GLOBAL')),
  name               JSONB NOT NULL,
  market             CHAR(2),                    -- ISO-3166 alpha-2
  currency           CHAR(3) NOT NULL,
  flag_emoji         TEXT,
  is_region_free     BOOLEAN NOT NULL,
  restriction_notice JSONB,
  CONSTRAINT regions_code_unique UNIQUE (code),
  -- A region-locked region without a customer-facing notice is a contract
  -- violation; the database refuses it rather than shipping a silent trap.
  CONSTRAINT regions_locked_requires_notice
    CHECK (is_region_free OR restriction_notice IS NOT NULL)
);

CREATE TABLE products (
  id                TEXT PRIMARY KEY,
  game_id           TEXT NOT NULL REFERENCES games(id),
  slug              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN
                      ('DIGITAL_CODE','GIFT_CARD','SUBSCRIPTION','GAME_CURRENCY',
                       'DLC','GAME','PLAYER_SERVICE','ACCOUNT_SERVICE','OTHER')),
  name              JSONB NOT NULL,
  short_description JSONB NOT NULL,
  description       JSONB NOT NULL,
  images            JSONB NOT NULL DEFAULT '[]',
  metadata          JSONB NOT NULL DEFAULT '{}',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  rating_average    NUMERIC(2,1),
  rating_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_unique UNIQUE (slug)
);
CREATE INDEX products_game_active_idx ON products (game_id) WHERE active;
CREATE INDEX products_tags_idx        ON products USING GIN (tags);
CREATE INDEX products_search_idx      ON products USING GIN (
  to_tsvector('simple', coalesce(name->>'he','') || ' ' || coalesce(description->>'he',''))
);

CREATE TABLE product_variants (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           JSONB NOT NULL,
  sku            TEXT NOT NULL,
  quantity_value NUMERIC,
  quantity_unit  JSONB,
  metadata       JSONB NOT NULL DEFAULT '{}',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT variants_sku_unique UNIQUE (sku),
  -- A numeric magnitude with no unit is unrenderable ("1,000,000" of what?).
  CONSTRAINT variants_quantity_needs_unit
    CHECK (quantity_value IS NULL OR quantity_unit IS NOT NULL)
);
CREATE INDEX variants_product_idx ON product_variants (product_id);
```

### Offers — the sellable unit

```sql
CREATE TABLE offers (
  id                    TEXT PRIMARY KEY,
  product_id            TEXT NOT NULL REFERENCES products(id),
  variant_id            TEXT NOT NULL REFERENCES product_variants(id),
  platform_id           TEXT NOT NULL REFERENCES platforms(id),
  region_id             TEXT NOT NULL REFERENCES regions(id),
  price_amount_minor    BIGINT NOT NULL CHECK (price_amount_minor > 0),
  price_currency        CHAR(3) NOT NULL,
  compare_at_minor      BIGINT,
  fulfillment_method    TEXT NOT NULL CHECK (fulfillment_method IN
                          ('DIGITAL_CODE','AUTOMATED_API','MANUAL_REVIEW',
                           'MANUAL_DELIVERY','IN_GAME_SERVICE','NOT_SUPPORTED')),
  checkout_requirements JSONB NOT NULL DEFAULT '[]',
  terms                 JSONB,
  max_per_order         INTEGER NOT NULL DEFAULT 10 CHECK (max_per_order > 0),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One offer per commercial configuration; a duplicate would make "the" price
  -- of a variant on a platform in a region ambiguous.
  CONSTRAINT offers_configuration_unique
    UNIQUE (variant_id, platform_id, region_id),
  CONSTRAINT offers_compare_at_above_price
    CHECK (compare_at_minor IS NULL OR compare_at_minor > price_amount_minor)
);
CREATE INDEX offers_product_active_idx ON offers (product_id) WHERE active;
CREATE INDEX offers_price_idx          ON offers (price_amount_minor) WHERE active;
```

**Application-level invariant** (not expressible as a simple constraint): a
requirement key inside `checkout_requirements` must belong to the closed
vocabulary, and `PLATFORM_ACCOUNT_HANDLE` / `GAME_PLAYER_ID` may appear only on
offers whose `fulfillment_method` is manual or in-game. Enforce in the
application and cover with a test, as the frontend already does.

---

## 4. Inventory

```sql
CREATE TABLE inventory (
  offer_id     TEXT PRIMARY KEY REFERENCES offers(id),
  status       TEXT NOT NULL CHECK (status IN
                 ('IN_STOCK','LOW_STOCK','OUT_OF_STOCK','PRE_ORDER','DISCONTINUED')),
  -- NULL = unlimited (a manual service has no unit count).
  quantity_available INTEGER CHECK (quantity_available >= 0),
  quantity_reserved  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  quantity_sold      INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_reservations (
  id                  TEXT PRIMARY KEY,
  offer_id            TEXT NOT NULL REFERENCES offers(id),
  checkout_session_id TEXT NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  order_id            TEXT REFERENCES orders(id),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  status              TEXT NOT NULL CHECK (status IN ('HELD','COMMITTED','RELEASED','EXPIRED')),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservations_expiry_idx ON inventory_reservations (expires_at)
  WHERE status = 'HELD';
CREATE INDEX reservations_offer_idx  ON inventory_reservations (offer_id, status);
```

For serialised stock (individual gift-card codes), add:

```sql
CREATE TABLE inventory_units (
  id           TEXT PRIMARY KEY,
  offer_id     TEXT NOT NULL REFERENCES offers(id),
  -- Encrypted at rest with a KMS-held key; never selected into a list query.
  secret_cipher BYTEA NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('AVAILABLE','RESERVED','SOLD','VOID')),
  reservation_id TEXT REFERENCES inventory_reservations(id),
  order_item_id  TEXT REFERENCES order_items(id),
  sold_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A unit can belong to at most one order line, ever. This is the constraint
  -- that makes selling the same code twice impossible rather than unlikely.
  CONSTRAINT inventory_units_one_order_item UNIQUE (order_item_id)
);
CREATE INDEX inventory_units_available_idx ON inventory_units (offer_id)
  WHERE status = 'AVAILABLE';
```

---

## 5. Customers and sessions

```sql
CREATE TABLE customers (
  id                 TEXT PRIMARY KEY,
  email              CITEXT NOT NULL,
  display_name       TEXT,
  phone              TEXT,
  preferred_locale   TEXT NOT NULL DEFAULT 'he' CHECK (preferred_locale IN ('he','en')),
  preferred_region   TEXT NOT NULL DEFAULT 'IL',
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent  BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_unique UNIQUE (email)
);
```

**There is no password column and there must never be one.** No password hash,
no 2FA secret, no recovery codes, no gaming-account credential, no card data.

```sql
CREATE TABLE auth_codes (
  id            TEXT PRIMARY KEY,
  email         CITEXT NOT NULL,
  code_hash     TEXT NOT NULL,          -- Argon2id; the plaintext is emailed only
  attempts      INTEGER NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  request_ip    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_codes_email_active_idx ON auth_codes (email, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE customer_sessions (
  id            TEXT PRIMARY KEY,       -- opaque; the cookie carries this
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,          -- hash of the cookie value, never the value
  user_agent    TEXT,
  ip            INET,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_customer_idx ON customer_sessions (customer_id)
  WHERE revoked_at IS NULL;
```

---

## 6. Cart and checkout

```sql
CREATE TABLE carts (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),   -- NULL while anonymous
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id        TEXT PRIMARY KEY,
  cart_id   TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  offer_id  TEXT NOT NULL REFERENCES offers(id),
  quantity  INTEGER NOT NULL CHECK (quantity > 0),
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_one_line_per_offer UNIQUE (cart_id, offer_id)
);
```

`cart_items` stores **no price**. The cart is a list of intentions; pricing is
derived on read. This is the schema-level expression of "the client never
decides what a customer pays".

```sql
CREATE TABLE checkout_sessions (
  id                    TEXT PRIMARY KEY,   -- high-entropy: it is a capability
  customer_id           TEXT REFERENCES customers(id),
  cart_id               TEXT REFERENCES carts(id),
  status                TEXT NOT NULL CHECK (status IN
                          ('OPEN','VALIDATING','READY_FOR_PAYMENT','PAYMENT_PENDING',
                           'COMPLETED','EXPIRED','CANCELLED')),
  -- Immutable commercial snapshot. Once written it is never updated, so a later
  -- catalog price change cannot alter an in-flight or historical purchase.
  pricing_snapshot      JSONB NOT NULL,
  requirements_snapshot JSONB NOT NULL,
  currency              CHAR(3) NOT NULL,
  region_id             TEXT NOT NULL REFERENCES regions(id),
  subtotal_minor        BIGINT NOT NULL,
  discount_minor        BIGINT NOT NULL DEFAULT 0,
  total_minor           BIGINT NOT NULL,
  coupon_code           TEXT,
  contact_values        JSONB,             -- answers to the requirement engine
  order_id              TEXT REFERENCES orders(id),
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkout_total_is_subtotal_less_discount
    CHECK (total_minor = subtotal_minor - discount_minor),
  CONSTRAINT checkout_discount_not_negative CHECK (discount_minor >= 0),
  CONSTRAINT checkout_total_not_negative    CHECK (total_minor >= 0),
  -- One checkout session yields at most one order.
  CONSTRAINT checkout_sessions_one_order UNIQUE (order_id)
);
CREATE INDEX checkout_sessions_expiry_idx ON checkout_sessions (expires_at)
  WHERE status IN ('OPEN','VALIDATING','READY_FOR_PAYMENT');

CREATE TABLE checkout_items (
  id                  TEXT PRIMARY KEY,
  checkout_session_id TEXT NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  offer_id            TEXT NOT NULL REFERENCES offers(id),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor    BIGINT NOT NULL,   -- frozen at session creation
  total_price_minor   BIGINT NOT NULL,
  region_id           TEXT NOT NULL REFERENCES regions(id),
  platform_id         TEXT NOT NULL REFERENCES platforms(id),
  fulfillment_method  TEXT NOT NULL,
  CONSTRAINT checkout_items_line_total
    CHECK (total_price_minor = unit_price_minor * quantity)
);
```

---

## 7. Payments

```sql
CREATE TABLE payment_intents (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id),
  checkout_session_id TEXT NOT NULL REFERENCES checkout_sessions(id),
  provider            TEXT NOT NULL,
  provider_intent_id  TEXT,
  amount_minor        BIGINT NOT NULL CHECK (amount_minor > 0),
  currency            CHAR(3) NOT NULL,
  status              TEXT NOT NULL CHECK (status IN
                        ('CREATED','REQUIRES_ACTION','PROCESSING','SUCCEEDED',
                         'FAILED','CANCELLED','EXPIRED')),
  failure_code        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_provider_intent_unique UNIQUE (provider, provider_intent_id)
);
-- At most one live intent per order: the database, not application luck, is
-- what stops a double-clicked Pay button opening two payments.
CREATE UNIQUE INDEX payment_intents_one_live_per_order
  ON payment_intents (order_id)
  WHERE status IN ('CREATED','REQUIRES_ACTION','PROCESSING');

CREATE TABLE payment_events (
  id                TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  provider          TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  type              TEXT NOT NULL,
  status_before     TEXT,
  status_after      TEXT,
  -- Provider payload with card data and PII stripped before storage.
  payload_redacted  JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Webhook replay protection at the storage layer.
  CONSTRAINT payment_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE TABLE refunds (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
  currency          CHAR(3) NOT NULL,
  reason            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
  operator_id       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**No table stores a card number, expiry or CVV.** The only payment identifiers
held are the provider's own opaque references.

---

## 8. Orders and fulfillment

```sql
CREATE TABLE orders (
  id                  TEXT PRIMARY KEY,   -- high-entropy; used as a capability
  order_number        TEXT NOT NULL,      -- human reference, e.g. TT-000123
  customer_id         TEXT REFERENCES customers(id),
  checkout_session_id TEXT NOT NULL REFERENCES checkout_sessions(id),
  contact_email       CITEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN
                        ('PENDING','PAYMENT_PROCESSING','PAID','PROCESSING',
                         'FULFILLING','DELIVERED','PAYMENT_FAILED','CANCELLED',
                         'FULFILLMENT_FAILED','REFUND_PENDING','REFUNDED')),
  payment_status      TEXT NOT NULL,
  fulfillment_status  TEXT NOT NULL,
  region_id           TEXT NOT NULL REFERENCES regions(id),
  currency            CHAR(3) NOT NULL,
  subtotal_minor      BIGINT NOT NULL,
  discount_minor      BIGINT NOT NULL DEFAULT 0,
  total_minor         BIGINT NOT NULL,
  refunded_minor      BIGINT NOT NULL DEFAULT 0,
  -- Immutable copy of the commercial state at purchase time.
  pricing_snapshot    JSONB NOT NULL,
  checkout_values     JSONB NOT NULL DEFAULT '{}',
  coupon_code         TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_number_unique UNIQUE (order_number),
  -- One order per checkout session. The idempotency guarantee, in the schema.
  CONSTRAINT orders_one_per_checkout_session UNIQUE (checkout_session_id),
  CONSTRAINT orders_total_is_subtotal_less_discount
    CHECK (total_minor = subtotal_minor - discount_minor),
  -- A refund can never exceed what was captured.
  CONSTRAINT orders_refund_within_total
    CHECK (refunded_minor >= 0 AND refunded_minor <= total_minor)
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX orders_status_idx   ON orders (status)
  WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED');

CREATE TABLE order_items (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  offer_id           TEXT NOT NULL REFERENCES offers(id),
  product_id         TEXT NOT NULL REFERENCES products(id),
  variant_id         TEXT NOT NULL REFERENCES product_variants(id),
  platform_id        TEXT NOT NULL REFERENCES platforms(id),
  region_id          TEXT NOT NULL REFERENCES regions(id),
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor   BIGINT NOT NULL,
  total_price_minor  BIGINT NOT NULL,
  -- Names are copied, not joined: a renamed product must not rewrite history.
  display_name       JSONB NOT NULL,
  display_variant    JSONB NOT NULL,
  fulfillment_method TEXT NOT NULL,
  CONSTRAINT order_items_line_total
    CHECK (total_price_minor = unit_price_minor * quantity)
);

CREATE TABLE fulfillments (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id      TEXT NOT NULL REFERENCES order_items(id),
  method             TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN
                       ('PENDING','PROCESSING','WAITING_FOR_CUSTOMER','READY',
                        'DELIVERED','FAILED','CANCELLED','REFUNDED')),
  provider           TEXT,
  provider_job_id    TEXT,
  attempts           INTEGER NOT NULL DEFAULT 0,
  estimated_ready_at TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  -- Encrypted; readable only after payment is verified.
  delivery_payload   BYTEA,
  failure_reason     JSONB,
  operator_id        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fulfillments_one_per_order_item UNIQUE (order_item_id)
);
CREATE INDEX fulfillments_open_idx ON fulfillments (status, created_at)
  WHERE status IN ('PENDING','PROCESSING','WAITING_FOR_CUSTOMER');

CREATE TABLE fulfillment_events (
  id             TEXT PRIMARY KEY,
  fulfillment_id TEXT NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  status_before  TEXT,
  status_after   TEXT,
  detail         JSONB,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('system','operator','provider','customer')),
  actor_id       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 9. Promotions

```sql
CREATE TABLE promotions (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN
                  ('PERCENT_OFF','AMOUNT_OFF','BUNDLE_DEAL','PRIORITY_DELIVERY')),
  title         JSONB NOT NULL,
  description   JSONB NOT NULL,
  percent_off   NUMERIC(5,2) CHECK (percent_off > 0 AND percent_off <= 100),
  amount_off_minor BIGINT CHECK (amount_off_minor > 0),
  currency      CHAR(3),
  game_ids      TEXT[],
  product_ids   TEXT[],
  region_ids    TEXT[],
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT promotions_exactly_one_discount_kind CHECK (
    (percent_off IS NOT NULL AND amount_off_minor IS NULL) OR
    (percent_off IS NULL AND amount_off_minor IS NOT NULL) OR
    (kind IN ('BUNDLE_DEAL','PRIORITY_DELIVERY'))
  ),
  CONSTRAINT promotions_window_ordered CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE coupons (
  id                    TEXT PRIMARY KEY,
  code                  CITEXT NOT NULL,
  promotion_id          TEXT NOT NULL REFERENCES promotions(id),
  min_subtotal_minor    BIGINT,
  max_redemptions       INTEGER,         -- NULL = unlimited
  max_per_customer      INTEGER NOT NULL DEFAULT 1,
  redemption_count      INTEGER NOT NULL DEFAULT 0,
  expires_at            TIMESTAMPTZ,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT coupons_code_unique UNIQUE (code),
  CONSTRAINT coupons_within_limit
    CHECK (max_redemptions IS NULL OR redemption_count <= max_redemptions)
);

CREATE TABLE coupon_redemptions (
  id          TEXT PRIMARY KEY,
  coupon_id   TEXT NOT NULL REFERENCES coupons(id),
  order_id    TEXT NOT NULL REFERENCES orders(id),
  customer_id TEXT REFERENCES customers(id),
  amount_minor BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A coupon cannot be redeemed twice against the same order.
  CONSTRAINT coupon_redemptions_once_per_order UNIQUE (coupon_id, order_id)
);
```

---

## 10. Cross-cutting tables

```sql
CREATE TABLE idempotency_keys (
  key             TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  request_hash    TEXT NOT NULL,          -- detects key reuse with a different body
  status          TEXT NOT NULL CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  response_status INTEGER,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, endpoint)
);
CREATE INDEX idempotency_expiry_idx ON idempotency_keys (expires_at);

CREATE TABLE webhook_events (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  type              TEXT NOT NULL,
  signature_valid   BOOLEAN NOT NULL,
  processed_at      TIMESTAMPTZ,
  payload_redacted  JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_unique UNIQUE (provider, provider_event_id)
);

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('customer','system','operator','provider')),
  actor_id      TEXT,
  request_id    TEXT,
  before_state  JSONB,
  after_state   JSONB,
  ip            INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_type_idx   ON audit_logs (event_type, created_at DESC);
```

`audit_logs` is **append-only**: no `UPDATE` or `DELETE` grant for the
application role, enforced by database privileges rather than convention.

```sql
CREATE TABLE reviews (
  id                 TEXT PRIMARY KEY,
  product_id         TEXT REFERENCES products(id),
  order_item_id      TEXT REFERENCES order_items(id),
  customer_id        TEXT REFERENCES customers(id),
  author_display_name TEXT NOT NULL,
  rating             SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title              TEXT,
  body               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PUBLISHED','REJECTED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One review per purchased line, which is what makes "verified purchase" mean
  -- something.
  CONSTRAINT reviews_one_per_order_item UNIQUE (order_item_id)
);

CREATE TABLE support_tickets (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  customer_id   TEXT REFERENCES customers(id),
  order_id      TEXT REFERENCES orders(id),
  topic         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN
                  ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED','CLOSED')),
  contact_email CITEXT NOT NULL,
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. Data integrity invariants

Which mechanism enforces each. **Prefer the database** — a constraint cannot be
forgotten under load or bypassed by a new code path.

| # | Invariant | Enforced by |
|---|---|---|
| 1 | An order references immutable purchased pricing | `orders.pricing_snapshot` written once; `order_items` copy names and prices |
| 2 | A payment intent belongs to exactly one checkout session | FK + `payment_intents.checkout_session_id NOT NULL` |
| 3 | An order cannot be paid twice | Partial unique index `payment_intents_one_live_per_order` + guarded status transition |
| 4 | One checkout session yields at most one order | `orders_one_per_checkout_session UNIQUE` |
| 5 | An inventory unit cannot be sold twice | `inventory_units_one_order_item UNIQUE` + row lock on claim |
| 6 | Fulfillment cannot deliver before payment is verified | Application guard: transition to `PROCESSING` requires `orders.status IN ('PAID','FULFILLING')`; covered by a test |
| 7 | A refund cannot exceed the captured amount | `orders_refund_within_total CHECK` |
| 8 | Currency cannot silently change | `currency` on session, order and intent; equality asserted at each transition |
| 9 | Region-sensitive offers retain their region | `order_items.region_id NOT NULL`, copied from the offer, never re-derived |
| 10 | Expired checkout sessions cannot be paid | `expires_at` checked in the transaction, with the row locked |
| 11 | Totals are internally consistent | `CHECK (total = subtotal - discount)` on session and order |
| 12 | A region-locked region always has a customer notice | `regions_locked_requires_notice CHECK` |
| 13 | A coupon is redeemed at most once per order | `coupon_redemptions_once_per_order UNIQUE` |
| 14 | Audit entries are never altered | No `UPDATE`/`DELETE` grant on `audit_logs` |

## 12. Retention

| Data | Retention | Note |
|---|---|---|
| `auth_codes` | Purge 24h after expiry | |
| `idempotency_keys` | 24h | |
| `customer_sessions` | Purge 30 days after expiry | |
| `webhook_events`, `payment_events` | 7 years | Financial record |
| `orders`, `order_items`, `refunds` | 7 years | Israeli bookkeeping rules — **confirm with an accountant** |
| `audit_logs` | 7 years | |
| `inventory_units.secret_cipher` | Erase 90 days after delivery | A delivered code is no longer needed |
| Closed-customer PII | Anonymise on request, retaining financial rows with a tombstoned customer reference | Right-to-erasure vs bookkeeping duty — **needs legal review** |
