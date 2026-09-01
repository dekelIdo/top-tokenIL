import { Offer, ProductVariant } from '../../domain';
import { coinRange, planForQuantity } from './coin-plan';

/**
 * The planner turns a requested amount into real bundles.
 *
 * These tests exist because it is the one place in the frontend that decides
 * what a customer will be charged. It must never invent a figure: every total
 * has to be a sum of prices the server quoted, and a plan must never hand back
 * less than what was asked for.
 */
function variant(id: string, quantity: number): ProductVariant {
  return {
    id,
    sku: id,
    name: { he: id, en: id },
    quantityValue: quantity,
    quantityUnit: { he: 'מטבעות', en: 'coins' },
  } as ProductVariant;
}

function offer(id: string, variantId: string, major: number): Offer {
  return {
    id,
    productId: 'prod-coins',
    variantId,
    platformId: 'plat-ps5',
    regionId: 'reg-global',
    price: { current: { amountMinor: major * 100, currency: 'ILS' } },
  } as Offer;
}

const VARIANTS = [
  variant('v-100k', 100_000),
  variant('v-250k', 250_000),
  variant('v-500k', 500_000),
  variant('v-1m', 1_000_000),
  variant('v-2m', 2_000_000),
];

const OFFERS = [
  offer('o-100k', 'v-100k', 49),
  offer('o-250k', 'v-250k', 119),
  offer('o-500k', 'v-500k', 219),
  offer('o-1m', 'v-1m', 399),
  offer('o-2m', 'v-2m', 749),
];

describe('planForQuantity', () => {
  it('fills an exact multiple from the largest bundles first', () => {
    const plan = planForQuantity(OFFERS, VARIANTS, 3_000_000)!;

    expect(plan.provided).toBe(3_000_000);
    expect(plan.total.amountMinor).toBe((749 + 399) * 100);
    expect(plan.lines.map((line) => line.quantityEach)).toEqual([2_000_000, 1_000_000]);
  });

  it('repeats the largest bundle when the amount calls for it', () => {
    const plan = planForQuantity(OFFERS, VARIANTS, 5_000_000)!;

    expect(plan.provided).toBe(5_000_000);
    expect(plan.total.amountMinor).toBe((749 * 2 + 399) * 100);
  });

  it('never returns less than what was requested', () => {
    for (const requested of [120_000, 333_333, 1_450_000, 4_100_000]) {
      const plan = planForQuantity(OFFERS, VARIANTS, requested)!;
      expect(plan.provided).toBeGreaterThanOrEqual(requested);
    }
  });

  it('covers a remainder with the smallest bundle that fits it', () => {
    // 600K is one 500K plus 100K left over, and 100K is the smallest bundle
    // that covers that remainder.
    const plan = planForQuantity(OFFERS, VARIANTS, 600_000)!;

    expect(plan.provided).toBe(600_000);
    expect(plan.total.amountMinor).toBe((219 + 49) * 100);
  });

  it('rounds up rather than under-filling, and says so through provided', () => {
    // 120K needs a 100K plus something for the last 20K; the smallest bundle
    // is 100K, so the plan overshoots to 200K.
    const plan = planForQuantity(OFFERS, VARIANTS, 120_000)!;

    expect(plan.provided).toBe(200_000);
    expect(plan.provided).toBeGreaterThan(plan.requested);
  });

  it('only ever totals prices that came from offers', () => {
    const plan = planForQuantity(OFFERS, VARIANTS, 2_750_000)!;
    const rebuilt = plan.lines.reduce(
      (sum, line) => sum + line.count * line.offer.price.current.amountMinor,
      0,
    );

    expect(plan.total.amountMinor).toBe(rebuilt);
  });

  it('reports a blended rate per million', () => {
    const plan = planForQuantity(OFFERS, VARIANTS, 2_000_000)!;

    // 749 for two million is 374.50 per million.
    expect(plan.perMillionMinor).toBe(37_450);
  });

  it('returns nothing when there is nothing to sell', () => {
    expect(planForQuantity([], [], 1_000_000)).toBeNull();
    expect(planForQuantity(OFFERS, VARIANTS, 0)).toBeNull();
  });
});

describe('coinRange', () => {
  it('spans the smallest bundle to a whole number of the largest', () => {
    const range = coinRange(OFFERS, VARIANTS, 10)!;

    expect(range.min).toBe(100_000);
    expect(range.max).toBe(20_000_000);
    expect(range.step).toBe(100_000);
  });

  it('is absent when no bundle carries a quantity', () => {
    expect(coinRange([], [])).toBeNull();
  });
});
