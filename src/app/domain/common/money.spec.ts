import {
  addMoney, fromMajor, isZeroMoney, money, multiplyMoney, subtractMoney, sumMoney,
} from './money';

/**
 * Money is the highest-risk pure logic in the product: a rounding error here is a
 * real customer being charged the wrong amount. These tests pin the two rules
 * that matter — minor-unit integers only, and no cross-currency arithmetic.
 */
describe('Money', () => {
  it('stores major units as integer minor units', () => {
    expect(fromMajor(49).amountMinor).toBe(4900);
    expect(fromMajor(0.1).amountMinor).toBe(10);
    expect(fromMajor(219.99).amountMinor).toBe(21999);
  });

  it('avoids the classic float error that decimal currency arithmetic produces', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in float arithmetic.
    const total = addMoney(fromMajor(0.1), fromMajor(0.2));
    expect(total.amountMinor).toBe(30);
    expect(Number.isInteger(total.amountMinor)).toBeTrue();
  });

  it('keeps every result an integer number of minor units', () => {
    const third = multiplyMoney(fromMajor(10), 1 / 3);
    expect(Number.isInteger(third.amountMinor)).toBeTrue();
    expect(third.amountMinor).toBe(333);
  });

  it('never returns a negative amount from subtraction', () => {
    expect(subtractMoney(fromMajor(10), fromMajor(25)).amountMinor).toBe(0);
  });

  it('sums a list without drift across many items', () => {
    const items = Array.from({ length: 100 }, () => fromMajor(0.07));
    expect(sumMoney(items).amountMinor).toBe(700);
  });

  it('multiplies a line total exactly', () => {
    expect(multiplyMoney(fromMajor(52), 3).amountMinor).toBe(15600);
  });

  it('refuses to add different currencies rather than silently coercing', () => {
    expect(() => addMoney(money(100, 'ILS'), money(100, 'USD'))).toThrowError(/Currency mismatch/);
  });

  it('refuses to subtract different currencies', () => {
    expect(() => subtractMoney(money(100, 'ILS'), money(100, 'EUR'))).toThrowError(/Currency mismatch/);
  });

  it('recognises a zero amount', () => {
    expect(isZeroMoney(money(0))).toBeTrue();
    expect(isZeroMoney(money(1))).toBeFalse();
  });

  it('defaults to shekels, the storefront currency', () => {
    expect(fromMajor(10).currency).toBe('ILS');
    expect(sumMoney([]).currency).toBe('ILS');
  });
});
