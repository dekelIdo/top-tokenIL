import type { PricedCart, PricedLine } from '../pricing.service';

/**
 * Priced lines to the wire shape the Angular mappers expect.
 *
 * Display text is resolved from the product and variant rows rather than sent up
 * by the client, so a cart line always names what the catalog says it is.
 */

function localized(value: unknown): { he: string; en?: string | null } {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['he'] === 'string') {
      return {
        he: record['he'],
        en: typeof record['en'] === 'string' ? record['en'] : null,
      };
    }
  }
  return { he: '' };
}

/** The first image on the product, used as the cart thumbnail. */
function primaryImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }
  const first = images[0] as Record<string, unknown> | null;
  return first && typeof first['url'] === 'string' ? first['url'] : null;
}

export function toCartItemDto(line: PricedLine) {
  const { offer } = line;

  return {
    id: line.id,
    offerId: offer.id,
    productId: offer.productId,
    variantId: offer.variantId,
    platformId: offer.platformId,
    regionId: offer.regionId,
    quantity: line.quantity,
    unitPrice: { amountMinor: line.unitPriceMinor, currency: line.currency },
    totalPrice: { amountMinor: line.totalPriceMinor, currency: line.currency },
    fulfillmentMethod: offer.fulfillmentMethod,
    displayName: localized(offer.product.name),
    displayVariantName: localized(offer.variant.name),
    imageUrl: primaryImage(offer.product.images),
  };
}

export function toCartDto(cart: PricedCart, options: { id?: string; couponCode?: string | null } = {}) {
  return {
    // The cart lives in the browser, so it has no server identity. A stable
    // placeholder keeps the wire shape complete without implying a resource
    // that could be fetched or, worse, addressed by someone else.
    id: options.id ?? 'cart_local',
    items: cart.lines.map(toCartItemDto),
    totals: {
      subtotal: { amountMinor: cart.subtotalMinor, currency: cart.currency },
      discount: { amountMinor: cart.discountMinor, currency: cart.currency },
      total: { amountMinor: cart.totalMinor, currency: cart.currency },
      itemCount: cart.lines.reduce((count, line) => count + line.quantity, 0),
    },
    couponCode: options.couponCode ?? null,
  };
}

export function toCartValidationDto(cart: PricedCart, couponCode?: string | null) {
  return {
    cart: toCartDto(cart, { couponCode }),
    issues: cart.issues.map((issue) => ({
      code: issue.code,
      itemId: issue.offerId ? `line_${issue.offerId}` : null,
      message: issue.message,
    })),
    // A cart with issues is still a cart; it simply is not the one the customer
    // thought they had. The client shows the differences before charging.
    valid: cart.issues.length === 0,
  };
}
