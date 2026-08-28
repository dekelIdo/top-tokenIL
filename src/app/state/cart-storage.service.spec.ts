import { TestBed } from '@angular/core/testing';

import { CartStorageService } from './cart-storage.service';

const KEY = 'top-token.cart.v2';

const VALID_ITEM = {
  id: 'ci_1',
  offerId: 'offer__prod-ps-gift-card__50__plat-ps5__reg-il',
  productId: 'prod-ps-gift-card',
  variantId: 'prod-ps-gift-card__50',
  platformId: 'plat-ps5',
  regionId: 'reg-il',
  quantity: 1,
  unitPrice: { amountMinor: 5200, currency: 'ILS' },
  totalPrice: { amountMinor: 5200, currency: 'ILS' },
  fulfillmentMethod: 'DIGITAL_CODE',
  displayName: { he: 'גיפט קארד' },
  displayVariantName: { he: '50' },
  addedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Everything read back from localStorage is attacker-controlled: a user can edit
 * it freely in DevTools. These tests pin that nothing malformed ever reaches the
 * rest of the app, and that reading never throws.
 */
describe('CartStorageService (hostile input)', () => {
  let service: CartStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartStorageService);
    localStorage.removeItem(KEY);
  });

  afterEach(() => localStorage.removeItem(KEY));

  it('returns an empty cart when nothing is stored', () => {
    expect(service.load()).toEqual([]);
  });

  it('accepts a well-formed item', () => {
    localStorage.setItem(KEY, JSON.stringify([VALID_ITEM]));
    expect(service.load().length).toBe(1);
  });

  it('survives invalid JSON without throwing', () => {
    localStorage.setItem(KEY, '{ not json at all');
    expect(() => service.load()).not.toThrow();
    expect(service.load()).toEqual([]);
  });

  it('rejects a stored value that is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ items: [VALID_ITEM] }));
    expect(service.load()).toEqual([]);
  });

  it('drops null and primitive entries', () => {
    localStorage.setItem(KEY, JSON.stringify([null, 42, 'nope', VALID_ITEM]));
    expect(service.load().length).toBe(1);
  });

  it('drops entries missing required identifiers', () => {
    const { offerId, ...withoutOffer } = VALID_ITEM;
    localStorage.setItem(KEY, JSON.stringify([withoutOffer]));
    expect(service.load()).toEqual([]);
  });

  it('rejects a non-numeric quantity', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...VALID_ITEM, quantity: 'lots' }]));
    expect(service.load()).toEqual([]);
  });

  it('rejects a zero or negative quantity', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { ...VALID_ITEM, id: 'a', quantity: 0 },
      { ...VALID_ITEM, id: 'b', quantity: -5 },
    ]));
    expect(service.load()).toEqual([]);
  });

  it('rejects a NaN or Infinity quantity', () => {
    // JSON cannot carry NaN, so this is what a crafted payload actually looks like.
    localStorage.setItem(KEY, `[${JSON.stringify({ ...VALID_ITEM, quantity: 1 }).replace('"quantity":1', '"quantity":1e999')}]`);
    expect(service.load()).toEqual([]);
  });

  it('rejects a malformed money object', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...VALID_ITEM, unitPrice: { amountMinor: 'free' } }]));
    expect(service.load()).toEqual([]);
  });

  it('rejects a display name that is not localized text', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...VALID_ITEM, displayName: 'plain string' }]));
    expect(service.load()).toEqual([]);
  });

  it('keeps the good entries and discards the bad ones in a mixed payload', () => {
    localStorage.setItem(KEY, JSON.stringify([
      VALID_ITEM,
      { ...VALID_ITEM, id: 'bad', quantity: -1 },
      { garbage: true },
    ]));
    const loaded = service.load();
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('ci_1');
  });

  it('round-trips what it saves', () => {
    service.save([VALID_ITEM as never]);
    expect(service.load().length).toBe(1);
  });

  it('clears the stored cart', () => {
    service.save([VALID_ITEM as never]);
    service.clear();
    expect(service.load()).toEqual([]);
  });

  it('recomputes totals rather than trusting stored ones', () => {
    const cart = service.buildCart('c1', [VALID_ITEM as never], '2026-01-01T00:00:00.000Z');
    expect(cart.totals.subtotal.amountMinor).toBe(5200);
    expect(cart.totals.itemCount).toBe(1);
  });
});
