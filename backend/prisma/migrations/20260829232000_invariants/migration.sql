-- Data-integrity invariants that Prisma's schema language cannot express.
--
-- These are CHECK constraints and partial unique indexes. They live in the
-- database rather than in application code on purpose: a constraint cannot be
-- forgotten by a new code path, bypassed under load, or skipped by a script
-- someone runs against production at 2am. Every one of them corresponds to a
-- line in docs/DATABASE-DESIGN.md §11.

-- ---------------------------------------------------------------------------
-- Regions: a region-locked region must carry a customer-facing notice.
-- Without this a customer could buy a US voucher with nothing on screen saying
-- it will not work on their Israeli account.
-- ---------------------------------------------------------------------------
ALTER TABLE "regions"
  ADD CONSTRAINT "regions_locked_requires_notice"
  CHECK ("is_region_free" OR "restriction_notice" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Offers: money sanity.
-- ---------------------------------------------------------------------------
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_price_positive"
  CHECK ("price_amount_minor" > 0);

-- A strike-through price that is not above the real price is either a bug or a
-- dark pattern. Both are refused.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_compare_at_above_price"
  CHECK ("compare_at_minor" IS NULL OR "compare_at_minor" > "price_amount_minor");

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_max_per_order_positive"
  CHECK ("max_per_order" > 0);

-- ---------------------------------------------------------------------------
-- Variants: a numeric magnitude with no unit cannot be rendered.
-- "1,000,000" of what?
-- ---------------------------------------------------------------------------
ALTER TABLE "product_variants"
  ADD CONSTRAINT "variants_quantity_needs_unit"
  CHECK ("quantity_value" IS NULL OR "quantity_unit" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Inventory: counts can never go negative, and reserved + sold can never
-- exceed what exists. This is the database half of "do not oversell".
-- ---------------------------------------------------------------------------
ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_counts_not_negative"
  CHECK (
    "quantity_reserved" >= 0
    AND "quantity_sold" >= 0
    AND ("quantity_available" IS NULL OR "quantity_available" >= 0)
  );

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_reserved_within_available"
  CHECK ("quantity_available" IS NULL OR "quantity_reserved" <= "quantity_available");

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "reservation_quantity_positive"
  CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- Cart, checkout and orders: totals cannot become mathematically inconsistent.
-- ---------------------------------------------------------------------------
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "checkout_items"
  ADD CONSTRAINT "checkout_items_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "checkout_items"
  ADD CONSTRAINT "checkout_items_line_total"
  CHECK ("total_price_minor" = "unit_price_minor" * "quantity");

ALTER TABLE "checkout_sessions"
  ADD CONSTRAINT "checkout_totals_consistent"
  CHECK (
    "discount_minor" >= 0
    AND "total_minor" >= 0
    AND "total_minor" = "subtotal_minor" - "discount_minor"
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_line_total"
  CHECK ("total_price_minor" = "unit_price_minor" * "quantity");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_totals_consistent"
  CHECK (
    "discount_minor" >= 0
    AND "total_minor" >= 0
    AND "total_minor" = "subtotal_minor" - "discount_minor"
  );

-- A refund can never exceed what was captured. The refunds table itself arrives
-- with the refund flow; this guards the running total from day one so no code
-- path can drive it past the amount the customer actually paid.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_refund_within_total"
  CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "total_minor");

-- ---------------------------------------------------------------------------
-- Payments: at most ONE live intent per order.
--
-- A partial unique index, which Prisma cannot express. This is what makes a
-- double-clicked Pay button structurally incapable of opening two payments
-- against one order, rather than merely unlikely to.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "payment_intents_one_live_per_order"
  ON "payment_intents" ("order_id")
  WHERE "status" IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING');

ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_amount_positive"
  CHECK ("amount_minor" > 0);

-- ---------------------------------------------------------------------------
-- Reviews: a rating outside 1..5 would break the star display and the average.
-- ---------------------------------------------------------------------------
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Promotions: exactly one kind of discount, and a coherent window.
-- ---------------------------------------------------------------------------
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_discount_shape"
  CHECK (
    ("kind" = 'PERCENT_OFF' AND "percent_off" IS NOT NULL AND "amount_off_minor" IS NULL)
    OR ("kind" = 'AMOUNT_OFF' AND "amount_off_minor" IS NOT NULL AND "percent_off" IS NULL)
    OR "kind" IN ('BUNDLE_DEAL', 'PRIORITY_DELIVERY')
  );

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_percent_range"
  CHECK ("percent_off" IS NULL OR ("percent_off" > 0 AND "percent_off" <= 100));

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_window_ordered"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_within_redemption_limit"
  CHECK ("max_redemptions" IS NULL OR "redemption_count" <= "max_redemptions");
