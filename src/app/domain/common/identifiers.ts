/**
 * Branded id aliases. They are structurally strings, so they cost nothing at
 * runtime, but they document intent at every call site and make the eventual
 * switch to opaque server ids a one-line change.
 */
export type Id = string;
export type GameId = Id;
export type PlatformId = Id;
export type RegionId = Id;
export type ProductId = Id;
export type VariantId = Id;
export type OfferId = Id;
export type CartId = Id;
export type CartItemId = Id;
export type OrderId = Id;
export type OrderItemId = Id;
export type CustomerId = Id;
export type PaymentIntentId = Id;
export type CheckoutSessionId = Id;
export type FulfillmentId = Id;
export type PromotionId = Id;
export type CouponId = Id;
export type ReviewId = Id;
export type SupportTicketId = Id;

/** URL-safe human-readable key used in routes instead of raw ids. */
export type Slug = string;

/** ISO-8601 timestamp string. Kept as a string so it survives JSON round-trips. */
export type IsoDateTime = string;
