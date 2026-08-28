import { Money, money, multiplyMoney, subtractMoney, sumMoney } from '../common';
import { Cart, CartItem, CartTotals } from './cart';

/**
 * Pure cart arithmetic, shared by the cart facade (for optimistic display) and by
 * the mock backend (for authoritative re-pricing). Keeping it in one place means
 * the two can never drift.
 */
export function lineTotal(item: Pick<CartItem, 'unitPrice' | 'quantity'>): Money {
  return multiplyMoney(item.unitPrice, item.quantity);
}

export function computeTotals(items: readonly CartItem[], discount?: Money): CartTotals {
  const subtotal = sumMoney(items.map(lineTotal));
  const appliedDiscount = discount ?? money(0, subtotal.currency);
  return {
    subtotal,
    discount: appliedDiscount,
    total: subtractMoney(subtotal, appliedDiscount),
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
  };
}

export function withItems(cart: Cart, items: readonly CartItem[], updatedAt: string, discount?: Money): Cart {
  return { ...cart, items, totals: computeTotals(items, discount), updatedAt };
}

export function isCartEmpty(cart: Cart): boolean {
  return cart.items.length === 0;
}
