import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../core/analytics';
import { NotificationService } from '../core/error';
import {
  AddToCartRequest, Cart, CartIssue, CartItem, CartItemId, CartValidationResult,
  computeTotals, localized, toAppError,
} from '../domain';
import { CartApiService } from '../data/api';
import { CartStorageService } from './cart-storage.service';

/**
 * Cart state for the whole application.
 *
 * The facade owns an immutable signal of cart state; components read it and call
 * intent methods. Every mutation produces a new array so `OnPush` components
 * update reliably, and every mutation is persisted.
 *
 * The locally held prices are display state. `validate()` asks the API to
 * re-price the cart against the catalog and is called before checkout — the
 * frontend never decides what a customer pays.
 */
@Injectable({ providedIn: 'root' })
export class CartFacade {
  private readonly api = inject(CartApiService);
  private readonly storage = inject(CartStorageService);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  private readonly itemsSignal = signal<readonly CartItem[]>(this.storage.load());
  private readonly couponSignal = signal<string | undefined>(undefined);
  private readonly busySignal = signal(false);
  private readonly issuesSignal = signal<readonly CartIssue[]>([]);

  readonly items = this.itemsSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly issues = this.issuesSignal.asReadonly();
  readonly totals = computed(() => computeTotals(this.itemsSignal()));
  readonly itemCount = computed(() => this.totals().itemCount);
  readonly isEmpty = computed(() => this.itemsSignal().length === 0);

  readonly cart = computed<Cart>(() => ({
    id: 'local-cart',
    items: this.itemsSignal(),
    totals: this.totals(),
    couponCode: this.couponSignal(),
    updatedAt: new Date().toISOString(),
  }));

  /**
   * Adds an offer to the cart. The line is built by the API from the offer id, so
   * the component never assembles a price.
   */
  add(request: AddToCartRequest): Observable<CartItem | null> {
    this.busySignal.set(true);
    return this.api.createItem(request).pipe(
      tap((item) => {
        this.mergeItem(item);
        this.busySignal.set(false);
        this.analytics.track(AnalyticsEvent.AddToCart, {
          offerId: item.offerId,
          productId: item.productId,
          quantity: item.quantity,
          priceMinor: item.unitPrice.amountMinor,
        });
        this.notifications.success(localized('הפריט נוסף לעגלה.', 'Added to your cart.'));
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  updateQuantity(itemId: CartItemId, quantity: number): void {
    if (quantity <= 0) {
      this.remove(itemId);
      return;
    }
    this.commit(this.itemsSignal().map((item) => (item.id === itemId
      ? { ...item, quantity, totalPrice: { ...item.unitPrice, amountMinor: item.unitPrice.amountMinor * quantity } }
      : item)));
  }

  remove(itemId: CartItemId): void {
    const removed = this.itemsSignal().find((item) => item.id === itemId);
    this.commit(this.itemsSignal().filter((item) => item.id !== itemId));
    if (removed) {
      this.analytics.track(AnalyticsEvent.RemoveFromCart, {
        offerId: removed.offerId,
        productId: removed.productId,
        quantity: removed.quantity,
      });
    }
  }

  clear(): void {
    this.couponSignal.set(undefined);
    this.issuesSignal.set([]);
    this.commit([]);
  }

  applyCoupon(code: string): Observable<boolean> {
    this.busySignal.set(true);
    return new Observable<boolean>((subscriber) => {
      const subscription = this.api.applyCoupon(this.cart(), code).subscribe({
        next: (application) => {
          this.busySignal.set(false);
          if (application.applied) {
            this.couponSignal.set(application.code);
            this.notifications.success(application.message);
          } else {
            this.notifications.info(application.message);
          }
          subscriber.next(application.applied);
          subscriber.complete();
        },
        error: (error: unknown) => {
          this.busySignal.set(false);
          this.notifications.error(toAppError(error));
          subscriber.next(false);
          subscriber.complete();
        },
      });
      return () => subscription.unsubscribe();
    });
  }

  /** Server-side re-pricing. Adopts whatever the API returns as the new cart. */
  validate(): Observable<CartValidationResult | null> {
    this.busySignal.set(true);
    return this.api.validate(this.cart()).pipe(
      tap((result) => {
        this.busySignal.set(false);
        this.issuesSignal.set(result.issues);
        this.commit(result.cart.items);
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  private mergeItem(incoming: CartItem): void {
    const existing = this.itemsSignal().find((item) => item.offerId === incoming.offerId);
    if (!existing) {
      this.commit([...this.itemsSignal(), incoming]);
      return;
    }
    const quantity = existing.quantity + incoming.quantity;
    this.commit(this.itemsSignal().map((item) => (item.id === existing.id
      ? { ...item, quantity, totalPrice: { ...item.unitPrice, amountMinor: item.unitPrice.amountMinor * quantity } }
      : item)));
  }

  private commit(items: readonly CartItem[]): void {
    this.itemsSignal.set(items);
    this.storage.save(items);
  }
}
