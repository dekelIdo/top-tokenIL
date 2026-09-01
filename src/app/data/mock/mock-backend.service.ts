import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import {
  AppError, CheckoutSession, FulfillmentStatus, Offer, Order, OrderStatus, PaymentIntent,
  localized, notFoundError,
} from '../../domain';

/**
 * In-memory stand-in for the future backend.
 *
 * It owns every piece of server-authoritative state (checkout sessions, payment
 * intents, orders) so that no UI layer has to. When the real API arrives this
 * class is deleted and the HTTP implementations are bound to the same abstract
 * services — no component changes.
 *
 * State lives in memory only and is intentionally lost on reload: an order is a
 * server record, and pretending a browser can own one would hide exactly the
 * coupling this architecture is meant to remove. Only the anonymous cart is
 * persisted locally, by `CartStorageService`.
 */
@Injectable({ providedIn: 'root' })
export class MockBackendService {
  readonly checkoutSessions = new Map<string, CheckoutSession>();
  readonly paymentIntents = new Map<string, PaymentIntent>();
  readonly orders = new Map<string, Order>();

  private sequence = 0;
  private readonly fulfillmentTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Simulated network latency so loading and skeleton states are exercised. */
  respond<T>(value: T, latencyMs = 220): Observable<T> {
    return of(value).pipe(delay(latencyMs));
  }

  fail<T>(error: AppError, latencyMs = 220): Observable<T> {
    return throwError(() => error).pipe(delay(latencyMs));
  }

  /** Resolves a value or emits a domain NotFound error — never a raw throw. */
  respondOrNotFound<T>(value: T | undefined, what: string, latencyMs = 220): Observable<T> {
    return value === undefined ? this.fail<T>(notFoundError(`${what} not found`), latencyMs) : this.respond(value, latencyMs);
  }

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString().padStart(6, '0')}`;
  }

  /** Human-facing order reference, e.g. EC-000123. */
  nextOrderReference(): string {
    this.sequence += 1;
    return `EC-${this.sequence.toString().padStart(6, '0')}`;
  }

  now(): string {
    return new Date().toISOString();
  }

  inMinutes(minutes: number): string {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  offerLabel(offer: Offer): string {
    return `${offer.productId}/${offer.variantId}`;
  }

  /**
   * Completes a manually-fulfilled order after a short delay.
   *
   * A real backend does this from an operator action or a supplier webhook; the
   * simulator compresses it to a few seconds so the order status page has a
   * genuine transition to render instead of sitting on "processing" forever.
   */
  scheduleFulfillmentCompletion(orderId: string, delayMs = 6000): void {
    if (this.fulfillmentTimers.has(orderId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.fulfillmentTimers.delete(orderId);
      const order = this.orders.get(orderId);
      if (!order || order.status !== OrderStatus.FulfillmentProcessing) {
        return;
      }
      const fulfillments = order.fulfillments.map((fulfillment) => (
        fulfillment.status === FulfillmentStatus.Processing
          ? {
            ...fulfillment,
            status: FulfillmentStatus.Delivered,
            updatedAt: this.now(),
            delivery: {
              deliveredAt: this.now(),
              payload: {
                kind: 'INSTRUCTIONS' as const,
                instructions: localized(
                  'האספקה הושלמה על ידי נציג. אם משהו חסר, פנו אלינו מדף התמיכה.',
                  'Delivered by a team member. If anything is missing, contact us from the support page.',
                ),
              },
            },
          }
          : fulfillment
      ));
      this.orders.set(orderId, {
        ...order,
        status: OrderStatus.Fulfilled,
        fulfillments,
        items: order.items.map((item, index) => ({
          ...item,
          fulfillmentStatus: fulfillments[index]?.status ?? item.fulfillmentStatus,
        })),
        updatedAt: this.now(),
        statusMessage: localized('ההזמנה סופקה במלואה.', 'Your order has been fully delivered.'),
      });
    }, delayMs);

    this.fulfillmentTimers.set(orderId, timer);
  }
}
