import { Money, Offer, ProductVariant } from '../../domain';

/**
 * Turning "I want this many coins" into real packages.
 *
 * The shop sells fixed bundles at prices the server set. A customer asking for
 * 3,000,000 coins is not asking for a bundle we sell, and the tempting shortcut
 * is to multiply a per-million rate and show the result. That would be the
 * frontend inventing a price, which it is never allowed to do.
 *
 * So the amount is filled the way a cashier would fill it: with the bundles we
 * actually have. Largest first, then the smallest bundle that covers whatever
 * is left. Every figure shown to the customer is a sum of prices the server
 * quoted, and the cart receives the same real offers.
 *
 * The plan can overshoot the request, because the last bundle has to cover the
 * remainder. That is stated rather than hidden: a customer asking for 3.2M and
 * getting 4M should be told so before they pay.
 */
export interface CoinPlanLine {
  readonly offer: Offer;
  readonly variant: ProductVariant;
  /** How many of this bundle. */
  readonly count: number;
  readonly quantityEach: number;
}

export interface CoinPlan {
  /** What the customer asked for. */
  readonly requested: number;
  /** What the bundles actually add up to; never less than `requested`. */
  readonly provided: number;
  readonly lines: readonly CoinPlanLine[];
  readonly total: Money;
  /** Blended price per million across the whole plan, in minor units. */
  readonly perMillionMinor: number;
}

interface Rung {
  readonly offer: Offer;
  readonly variant: ProductVariant;
  readonly quantity: number;
}

/** The purchasable bundles, largest first, for one platform and region. */
function rungs(offers: readonly Offer[], variants: readonly ProductVariant[]): Rung[] {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  return offers
    .map((offer) => {
      const variant = byId.get(offer.variantId);
      const quantity = variant?.quantityValue;
      return variant && quantity && quantity > 0 ? { offer, variant, quantity } : null;
    })
    .filter((rung): rung is Rung => rung !== null)
    .sort((a, b) => b.quantity - a.quantity);
}

/**
 * The smallest and largest amounts the selector can offer.
 *
 * The ceiling is a whole number of the largest bundle rather than an arbitrary
 * round figure, so the top of the range is always something we can actually
 * sell.
 */
export function coinRange(
  offers: readonly Offer[],
  variants: readonly ProductVariant[],
  maxBundles = 10,
): { min: number; max: number; step: number } | null {
  const available = rungs(offers, variants);
  if (available.length === 0) {
    return null;
  }

  const smallest = available[available.length - 1].quantity;
  const largest = available[0].quantity;

  return { min: smallest, max: largest * maxBundles, step: smallest };
}

/**
 * Fills a requested amount from real bundles.
 *
 * Greedy from the largest bundle down. Greedy is not always the cheapest answer
 * in the general case, but here the bundles get cheaper per coin as they grow,
 * so taking the largest first is also the cheapest first. The remainder is
 * covered by the smallest bundle that is at least as large as what is left,
 * which avoids handing someone four small bundles when one medium one costs
 * less.
 */
export function planForQuantity(
  offers: readonly Offer[],
  variants: readonly ProductVariant[],
  requested: number,
): CoinPlan | null {
  const available = rungs(offers, variants);
  if (available.length === 0 || requested <= 0) {
    return null;
  }

  const currency = available[0].offer.price.current.currency;
  const lines: CoinPlanLine[] = [];
  let remaining = requested;

  for (const rung of available) {
    // Never take the last bundle greedily: the remainder is handled below, and
    // rounding up there is what keeps the plan from overshooting by a lot.
    const count = Math.floor(remaining / rung.quantity);
    if (count > 0) {
      lines.push({
        offer: rung.offer,
        variant: rung.variant,
        count,
        quantityEach: rung.quantity,
      });
      remaining -= count * rung.quantity;
    }
  }

  if (remaining > 0) {
    // The cheapest single bundle that covers what is left. Bundles are sorted
    // large to small, so the last one that still covers the remainder is the
    // smallest one that does.
    const cover = [...available].reverse().find((rung) => rung.quantity >= remaining)
      ?? available[0];

    const existing = lines.find((line) => line.offer.id === cover.offer.id);
    if (existing) {
      lines.splice(lines.indexOf(existing), 1, { ...existing, count: existing.count + 1 });
    } else {
      lines.push({
        offer: cover.offer,
        variant: cover.variant,
        count: 1,
        quantityEach: cover.quantity,
      });
    }
  }

  const provided = lines.reduce((sum, line) => sum + line.count * line.quantityEach, 0);
  const amountMinor = lines.reduce(
    (sum, line) => sum + line.count * line.offer.price.current.amountMinor,
    0,
  );

  return {
    requested,
    provided,
    lines,
    total: { amountMinor, currency },
    perMillionMinor: provided > 0 ? Math.round((amountMinor / provided) * 1_000_000) : 0,
  };
}
