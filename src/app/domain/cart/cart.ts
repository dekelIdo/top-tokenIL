import {
  CartId, CartItemId, IsoDateTime, LocalizedText, Money, OfferId, PlatformId,
  ProductId, RegionId, VariantId,
} from '../common';
import { FulfillmentMethod } from '../fulfillment';

/**
 * A cart line. It references catalog entities by id and keeps a *display* copy of
 * the price and name so the cart renders without refetching.
 *
 * The displayed unit price is advisory only: `CartApiService.validate()` re-prices
 * every line against the catalog, and the backend will remain authoritative. The
 * frontend must never be the source of truth for what a customer pays.
 */
export interface CartItem {
  readonly id: CartItemId;
  readonly offerId: OfferId;
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly platformId: PlatformId;
  readonly regionId: RegionId;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly totalPrice: Money;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly displayName: LocalizedText;
  readonly displayVariantName: LocalizedText;
  readonly imageUrl?: string;
  readonly addedAt: IsoDateTime;
}

export interface CartTotals {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly itemCount: number;
}

export interface Cart {
  readonly id: CartId;
  readonly items: readonly CartItem[];
  readonly totals: CartTotals;
  readonly couponCode?: string;
  readonly updatedAt: IsoDateTime;
}

export type CartIssueCode =
  | 'OFFER_UNAVAILABLE'
  | 'PRICE_CHANGED'
  | 'QUANTITY_REDUCED'
  | 'OUT_OF_STOCK'
  | 'COUPON_INVALID';

export interface CartIssue {
  readonly code: CartIssueCode;
  readonly itemId?: CartItemId;
  readonly message: LocalizedText;
}

/** Result of re-pricing a cart against the catalog. */
export interface CartValidationResult {
  readonly cart: Cart;
  readonly issues: readonly CartIssue[];
  readonly valid: boolean;
}

export interface AddToCartRequest {
  readonly offerId: OfferId;
  readonly quantity: number;
}
