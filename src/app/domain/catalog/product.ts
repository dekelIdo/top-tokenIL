import {
  GameId, ImageAsset, LocalizedText, PlatformId, Price, ProductId, RegionId, Slug, VariantId, OfferId,
} from '../common';
import { CheckoutRequirement } from '../checkout/requirements';
import { FulfillmentMethod } from '../fulfillment';
import { Inventory } from './inventory';
import { ProductType } from './product-type';

/**
 * Free-form, type-specific attributes. A coin bundle puts its coin amount here;
 * a gift card puts its denomination here. The platform layer never reads these
 * keys directly — presentation components declare the ones they care about.
 */
export interface ProductMetadata {
  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * A concrete purchasable configuration of a product: "100K coins", "150 ILS card",
 * "12 months". Variants carry no price; price lives on the Offer, because the same
 * variant can be sold at different prices per region.
 */
export interface ProductVariant {
  readonly id: VariantId;
  readonly productId: ProductId;
  readonly name: LocalizedText;
  readonly sku: string;
  /** Numeric magnitude with its unit, when the variant has one. */
  readonly quantityValue?: number;
  readonly quantityUnit?: LocalizedText;
  readonly metadata: ProductMetadata;
  readonly sortOrder: number;
  readonly active: boolean;
}

/**
 * A sellable proposition: this variant, on this platform, in this region, at this
 * price, delivered this way. Offers are what the cart and checkout operate on.
 */
export interface Offer {
  readonly id: OfferId;
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly platformId: PlatformId;
  readonly regionId: RegionId;
  readonly price: Price;
  readonly inventory: Inventory;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Extra fields this specific offer needs at checkout, beyond the defaults. */
  readonly checkoutRequirements: readonly CheckoutRequirement[];
  readonly terms?: LocalizedText;
  readonly active: boolean;
}

export interface Product {
  readonly id: ProductId;
  readonly gameId: GameId;
  readonly slug: Slug;
  readonly type: ProductType;
  readonly name: LocalizedText;
  readonly shortDescription: LocalizedText;
  readonly description: LocalizedText;
  readonly platformIds: readonly PlatformId[];
  readonly regionIds: readonly RegionId[];
  readonly images: readonly ImageAsset[];
  readonly metadata: ProductMetadata;
  readonly variants: readonly ProductVariant[];
  readonly fulfillmentMethods: readonly FulfillmentMethod[];
  readonly tags: readonly string[];
  /**
   * Lowest current offer price, denormalised by the API so a catalog grid can be
   * rendered from one request instead of fetching every product's offers.
   */
  readonly fromPrice?: Price;
  readonly active: boolean;
  readonly featured: boolean;
  readonly ratingAverage?: number;
  readonly ratingCount?: number;
}

/** Product plus the offers and resolved lookups a detail page needs in one payload. */
export interface ProductDetail {
  readonly product: Product;
  readonly offers: readonly Offer[];
}
