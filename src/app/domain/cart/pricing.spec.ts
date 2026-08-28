import { FulfillmentMethod } from '../fulfillment';
import { fromMajor, money } from '../common';
import { CartItem } from './cart';
import { computeTotals, isCartEmpty, lineTotal } from './pricing';

function item(partial: Partial<CartItem> = {}): CartItem {
  const unitPrice = partial.unitPrice ?? fromMajor(52);
  const quantity = partial.quantity ?? 1;
  return {
    id: partial.id ?? 'ci_1',
    offerId: partial.offerId ?? 'offer_1',
    productId: 'prod_1',
    variantId: 'var_1',
    platformId: 'plat-ps5',
    regionId: 'reg-il',
    quantity,
    unitPrice,
    totalPrice: { ...unitPrice, amountMinor: unitPrice.amountMinor * quantity },
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    displayName: { he: 'מוצר' },
    displayVariantName: { he: '50' },
    addedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('cart pricing', () => {
  it('totals an empty cart to zero rather than NaN', () => {
    const totals = computeTotals([]);
    expect(totals.subtotal.amountMinor).toBe(0);
    expect(totals.total.amountMinor).toBe(0);
    expect(totals.itemCount).toBe(0);
  });

  it('multiplies unit price by quantity for each line', () => {
    expect(lineTotal({ unitPrice: fromMajor(52), quantity: 3 }).amountMinor).toBe(15600);
  });

  it('sums several lines exactly', () => {
    const totals = computeTotals([
      item({ id: 'a', unitPrice: fromMajor(49), quantity: 2 }),
      item({ id: 'b', unitPrice: fromMajor(119), quantity: 1 }),
    ]);
    expect(totals.subtotal.amountMinor).toBe(4900 * 2 + 11900);
    expect(totals.itemCount).toBe(3);
  });

  it('subtracts a discount from the total but leaves the subtotal alone', () => {
    const totals = computeTotals([item({ unitPrice: fromMajor(100), quantity: 2 })], fromMajor(20));
    expect(totals.subtotal.amountMinor).toBe(20000);
    expect(totals.discount.amountMinor).toBe(2000);
    expect(totals.total.amountMinor).toBe(18000);
  });

  it('never produces a negative total from an oversized discount', () => {
    const totals = computeTotals([item({ unitPrice: fromMajor(10) })], fromMajor(999));
    expect(totals.total.amountMinor).toBe(0);
  });

  it('treats a zero discount as no discount', () => {
    const totals = computeTotals([item({ unitPrice: fromMajor(10) })], money(0));
    expect(totals.total.amountMinor).toBe(1000);
  });

  it('reports emptiness from the item list, not the totals', () => {
    expect(isCartEmpty({ id: 'c', items: [], totals: computeTotals([]), updatedAt: '' })).toBeTrue();
    expect(isCartEmpty({ id: 'c', items: [item()], totals: computeTotals([item()]), updatedAt: '' })).toBeFalse();
  });
});
