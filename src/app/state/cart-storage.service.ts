import { Injectable, inject } from '@angular/core';

import { Cart, CartItem, computeTotals } from '../domain';
import { LoggerService } from '../core/logger.service';

const STORAGE_KEY = 'top-token.cart.v2';

/**
 * Local persistence for the anonymous cart.
 *
 * Two rules govern this file. First, nothing sensitive is stored: only offer ids,
 * quantities and display strings — no contact details, no checkout answers, no
 * order data. Second, everything read back is treated as hostile input and
 * validated field by field, because a user can edit `localStorage` freely. The
 * cached prices are for rendering only; `CartApiService.validate()` re-prices the
 * cart before checkout and the backend stays authoritative.
 */
@Injectable({ providedIn: 'root' })
export class CartStorageService {
  private readonly logger = inject(LoggerService);

  load(): readonly CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const items = parsed.filter(isCartItem);
      if (items.length !== parsed.length) {
        this.logger.warn('Discarded malformed cart entries from local storage');
      }
      return items;
    } catch {
      this.logger.warn('Could not read the cart from local storage');
      return [];
    }
  }

  save(items: readonly CartItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage may be full or blocked (private mode). The cart still works for
      // this session, so this is not worth interrupting the customer over.
      this.logger.warn('Could not persist the cart to local storage');
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      this.logger.warn('Could not clear the cart from local storage');
    }
  }

  /** Rebuilds a Cart shell around restored items. Totals are recomputed, never read. */
  buildCart(id: string, items: readonly CartItem[], updatedAt: string, couponCode?: string): Cart {
    return { id, items, totals: computeTotals(items), updatedAt, couponCode };
  }
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item['id'] === 'string'
    && typeof item['offerId'] === 'string'
    && typeof item['productId'] === 'string'
    && typeof item['variantId'] === 'string'
    && typeof item['platformId'] === 'string'
    && typeof item['regionId'] === 'string'
    && typeof item['quantity'] === 'number'
    && Number.isFinite(item['quantity'])
    && item['quantity'] > 0
    && isMoney(item['unitPrice'])
    && isMoney(item['totalPrice'])
    && typeof item['fulfillmentMethod'] === 'string'
    && isLocalizedText(item['displayName'])
    && isLocalizedText(item['displayVariantName']);
}

function isMoney(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const money = value as Record<string, unknown>;
  return typeof money['amountMinor'] === 'number'
    && Number.isFinite(money['amountMinor'])
    && typeof money['currency'] === 'string';
}

function isLocalizedText(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)['he'] === 'string';
}
