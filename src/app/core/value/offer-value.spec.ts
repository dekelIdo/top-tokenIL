import { Offer, Price, ProductVariant } from '../../domain';
import { formatQuantity, hasRealDiscount, perUnitPrice, rankByValue, savedAmount } from './offer-value';

const variant = (id: string, quantityValue?: number): ProductVariant => ({
  id, productId: 'p1', name: { he: id }, sku: id, quantityValue,
  metadata: {}, sortOrder: 0, active: true,
});

const offer = (id: string, variantId: string, amountMinor: number, compareAtMinor?: number): Offer => ({
  id, productId: 'p1', variantId, platformId: 'ps5', regionId: 'global',
  price: {
    current: { amountMinor, currency: 'ILS' },
    compareAt: compareAtMinor ? { amountMinor: compareAtMinor, currency: 'ILS' } : undefined,
  } as Price,
  inventory: { status: 'IN_STOCK' } as Offer['inventory'],
  fulfillmentMethod: 'MANUAL_DELIVERY' as Offer['fulfillmentMethod'],
  checkoutRequirements: [], active: true,
});

describe('offer value', () => {
  it('prices per million from the variant quantity', () => {
    // 100K for 49 shekels is 490 shekels per million.
    expect(perUnitPrice(offer('o', 'v', 4900), variant('v', 100_000))).toBe(49_000);
  });

  it('has no per-unit price for a variant without a quantity', () => {
    // A gift card cannot be compared per million, and must not pretend to be.
    expect(perUnitPrice(offer('o', 'v', 4900), variant('v'))).toBeUndefined();
  });

  it('marks the cheapest per-unit offer as the best value', () => {
    const variants = [variant('small', 100_000), variant('big', 1_000_000)];
    // 490/M versus 390/M: the big bundle wins.
    const ranked = rankByValue([offer('a', 'small', 4900), offer('b', 'big', 39_000)], variants);

    expect(ranked.find((r) => r.variant.id === 'big')?.isBestValue).toBe(true);
    expect(ranked.find((r) => r.variant.id === 'small')?.isBestValue).toBe(false);
  });

  it('calls nothing the best value when there is only one thing to buy', () => {
    const ranked = rankByValue([offer('a', 'v', 4900)], [variant('v', 100_000)]);
    expect(ranked[0].isBestValue).toBe(false);
  });

  it('calls nothing the best value when every bundle is equally priced', () => {
    const variants = [variant('a', 1_000_000), variant('b', 2_000_000)];
    const ranked = rankByValue([offer('x', 'a', 10_000), offer('y', 'b', 20_000)], variants);
    expect(ranked.every((r) => !r.isBestValue)).toBe(true);
  });

  it('states the saving against the worst per-unit price', () => {
    const variants = [variant('small', 100_000), variant('big', 1_000_000)];
    const ranked = rankByValue([offer('a', 'small', 5000), offer('b', 'big', 25_000)], variants);
    // 500/M against 250/M is half the price.
    expect(ranked.find((r) => r.variant.id === 'big')?.savingsPercent).toBe(50);
  });

  it('ignores a strike-through that is not actually a saving', () => {
    expect(hasRealDiscount(offer('o', 'v', 5000, 5000).price)).toBe(false);
    expect(hasRealDiscount(offer('o', 'v', 5000, 4000).price)).toBe(false);
    expect(hasRealDiscount(offer('o', 'v', 5000, 6000).price)).toBe(true);
  });

  it('reports what a real discount saves', () => {
    expect(savedAmount(offer('o', 'v', 5000, 6500).price)).toEqual({ amountMinor: 1500, currency: 'ILS' });
    expect(savedAmount(offer('o', 'v', 5000).price)).toBeUndefined();
  });

  it('formats quantities the way players say them', () => {
    expect(formatQuantity(2_000_000)).toBe('2M');
    expect(formatQuantity(1_500_000)).toBe('1.5M');
    expect(formatQuantity(500_000)).toBe('500K');
    expect(formatQuantity(undefined)).toBe('');
  });
});
