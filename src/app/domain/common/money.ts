/** Supported settlement currencies. Prices are always quoted in one of these. */
export type CurrencyCode = 'ILS' | 'USD' | 'EUR' | 'GBP';

/**
 * Money is stored in minor units (agorot / cents) to avoid float drift.
 * Never do arithmetic on `Price.formatted` — it is presentation only.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** A price as offered to the customer, optionally struck through against a list price. */
export interface Price {
  readonly current: Money;
  readonly compareAt?: Money;
  readonly discountPercent?: number;
}

export function money(amountMinor: number, currency: CurrencyCode = 'ILS'): Money {
  return { amountMinor, currency };
}

export function fromMajor(amountMajor: number, currency: CurrencyCode = 'ILS'): Money {
  return { amountMinor: Math.round(amountMajor * 100), currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: Math.max(0, a.amountMinor - b.amountMinor), currency: a.currency };
}

export function multiplyMoney(a: Money, factor: number): Money {
  return { amountMinor: Math.round(a.amountMinor * factor), currency: a.currency };
}

export function sumMoney(values: readonly Money[], currency: CurrencyCode = 'ILS'): Money {
  return values.reduce<Money>((acc, value) => addMoney(acc, value), money(0, currency));
}

export function isZeroMoney(value: Money): boolean {
  return value.amountMinor === 0;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
