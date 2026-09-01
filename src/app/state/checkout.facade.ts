import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../core/analytics';
import { NotificationService } from '../core/error';
import {
  CheckoutFieldValues, CheckoutSession, CheckoutSessionId, CheckoutValidationIssue,
  LocalizedText, OrderId,
  PaymentInstrumentRef, PaymentIntent, PaymentProviderId, PaymentResult, PaymentStatus,
  SimulatedInstrument, localized, toAppError,
} from '../domain';
import { CheckoutApiService, OrderApiService, PaymentApiService } from '../data/api';
import { environment } from '../../environments/environment';
import { CartFacade } from './cart.facade';

/**
 * Where this tab remembers the checkout it is in the middle of.
 *
 * Versioned, so a future shape change cannot resurrect an incompatible id.
 */
const SESSION_KEY = 'easycoins.checkout.v1';

/**
 * Drives the checkout flow: validate the cart, open a session whose required
 * fields come from the offers in that cart, create the order, then run payment
 * through a provider-agnostic intent.
 *
 * No method here accepts or holds card details. The payment step only confirms
 * that the customer completed the provider-side action.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutFacade {
  private readonly checkoutApi = inject(CheckoutApiService);
  private readonly orderApi = inject(OrderApiService);
  private readonly paymentApi = inject(PaymentApiService);
  private readonly cart = inject(CartFacade);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  private readonly sessionSignal = signal<CheckoutSession | null>(null);
  private readonly intentSignal = signal<PaymentIntent | null>(null);
  private readonly issuesSignal = signal<readonly CheckoutValidationIssue[]>([]);
  private readonly busySignal = signal(false);
  private readonly orderIdSignal = signal<OrderId | null>(null);
  private readonly instrumentsSignal = signal<readonly SimulatedInstrument[]>([]);
  private readonly paymentFailureSignal = signal<LocalizedText | null>(null);
  private readonly paymentStatusSignal = signal<PaymentStatus | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly intent = this.intentSignal.asReadonly();
  readonly issues = this.issuesSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly orderId = this.orderIdSignal.asReadonly();
  readonly requirements = computed(() => this.sessionSignal()?.requirements ?? []);
  readonly providers = computed(() => this.sessionSignal()?.availableProviders ?? []);
  readonly instruments = this.instrumentsSignal.asReadonly();
  readonly paymentFailure = this.paymentFailureSignal.asReadonly();
  readonly paymentStatus = this.paymentStatusSignal.asReadonly();

  /** True while the gateway holds the payment and the customer must wait. */
  readonly paymentPending = computed(() => this.paymentStatusSignal() === PaymentStatus.Processing);

  /** A settled-failed payment can be retried against the same order. */
  readonly canRetryPayment = computed(() => {
    const status = this.paymentStatusSignal();
    return status === PaymentStatus.Failed || status === PaymentStatus.Cancelled;
  });

  /**
   * Re-prices the cart, then opens a session shaped by what is actually in it.
   *
   * If this tab already has a session, it is resumed rather than replaced. The
   * server makes one order per session, so that guarantee only reaches the
   * customer if the session survives: the page used to mint a fresh one on
   * every mount, which meant a refresh after submitting produced a second
   * session and, against a real backend, a second order. The checkout screen
   * told the customer in as many words that this could not happen.
   *
   * `sessionStorage` rather than `localStorage`: a checkout in progress belongs
   * to this tab and should not be adopted by another one or outlive the window.
   */
  start(): Observable<CheckoutSession | null> {
    this.busySignal.set(true);
    this.analytics.track(AnalyticsEvent.BeginCheckout, { itemCount: this.cart.itemCount() });

    return this.cart.validate().pipe(
      switchMap((validation) => {
        if (!validation) {
          return of(null);
        }
        for (const issue of validation.issues) {
          this.notifications.info(issue.message);
        }

        const resumed = this.readSessionId();
        if (resumed) {
          return this.checkoutApi.getSession(resumed).pipe(
            // A session that no longer exists, from a closed window or a server
            // restart, is not an error the customer should see. Start a new one.
            catchError(() => {
              this.forgetSessionId();
              return this.checkoutApi.createSession(this.cart.cart());
            }),
          );
        }
        return this.checkoutApi.createSession(this.cart.cart());
      }),
      tap((session) => {
        this.busySignal.set(false);
        this.sessionSignal.set(session);
        if (session) {
          this.rememberSessionId(session.id);
        }
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  /** Submits the dynamic details form and creates the order when it validates. */
  submitDetails(values: CheckoutFieldValues): Observable<OrderId | null> {
    const session = this.sessionSignal();
    // Re-entry guard: a double-submit while a request is in flight, or after the
    // order already exists, must not start a second order.
    if (!session || this.busySignal() || this.orderIdSignal() !== null) {
      return of(this.orderIdSignal());
    }
    this.busySignal.set(true);

    return this.checkoutApi.submitDetails(session.id, values).pipe(
      switchMap((result) => {
        this.sessionSignal.set(result.session);
        this.issuesSignal.set(result.issues);
        if (result.issues.length > 0) {
          this.busySignal.set(false);
          this.analytics.track(AnalyticsEvent.CheckoutValidationError, { issueCount: result.issues.length });
          return of(null);
        }
        return this.orderApi.createFromCheckout(result.session.id);
      }),
      tap((order) => {
        this.busySignal.set(false);
        if (order) {
          this.orderIdSignal.set(order.id);
          this.analytics.track(AnalyticsEvent.OrderCreated, {
            orderId: order.id,
            totalMinor: order.totals.total.amountMinor,
            itemCount: order.items.length,
          });
        }
      }),
      switchMap((order) => of(order ? order.id : null)),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  /** Opens a payment intent with the chosen provider. Collects no card data. */
  startPayment(provider: PaymentProviderId): Observable<PaymentIntent | null> {
    const session = this.sessionSignal();
    if (!session || this.busySignal()) {
      return of(this.intentSignal());
    }
    if (!environment.paymentsEnabled) {
      // The flag exists so payments can be switched off without shipping a
      // half-working checkout; when it is off, say so instead of simulating.
      this.notifications.info(localized(
        'התשלום מושבת כרגע. ההזמנה נשמרה ואפשר להשלים אותה מול התמיכה.',
        'Payments are currently disabled. Your order was saved and support can complete it.',
      ));
      return of(null);
    }
    this.busySignal.set(true);
    this.analytics.track(AnalyticsEvent.PaymentStarted, { provider });

    return this.paymentApi.createSession(session.id, provider).pipe(
      tap((paymentSession) => {
        this.busySignal.set(false);
        this.intentSignal.set(paymentSession.intent);
        this.instrumentsSignal.set(paymentSession.instruments ?? []);
        this.paymentStatusSignal.set(paymentSession.intent.status);
        this.paymentFailureSignal.set(null);
      }),
      switchMap((paymentSession) => of(paymentSession.intent)),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  /**
   * Confirms the provider-side step with an opaque instrument token.
   *
   * Guarded against double submission, and every non-success branch is surfaced
   * to the customer with a safe message instead of being swallowed.
   */
  confirmPayment(instrument: PaymentInstrumentRef): Observable<PaymentResult | null> {
    const intent = this.intentSignal();
    if (!intent || this.busySignal()) {
      return of(null);
    }
    this.busySignal.set(true);
    this.paymentFailureSignal.set(null);
    this.paymentStatusSignal.set(PaymentStatus.Processing);

    return this.paymentApi.confirm(intent.id, instrument).pipe(
      tap((result) => {
        this.busySignal.set(false);
        this.paymentStatusSignal.set(result.status);

        switch (result.status) {
          case PaymentStatus.Succeeded:
            this.analytics.track(AnalyticsEvent.PaymentSuccess, { orderId: result.orderId });
            this.cart.clear();
            // The session has produced its order and must not be resumed by a
            // later visit to checkout.
            this.forgetSessionId();
            this.notifications.success(localized('התשלום אושר וההזמנה נוצרה.', 'Payment approved and your order was created.'));
            break;
          case PaymentStatus.Processing:
            this.paymentFailureSignal.set(localized(
              'התשלום עדיין בעיבוד אצל ספק הסליקה. אל תשלמו שוב. נעדכן אתכם בדף ההזמנה ובמייל.',
              'The payment is still processing at the gateway. Do not pay again. We will update you on the order page and by email.',
            ));
            break;
          default:
            this.analytics.track(AnalyticsEvent.PaymentFailed, { orderId: result.orderId, status: result.status });
            this.paymentFailureSignal.set(result.failureReason ?? localized(
              'התשלום לא הושלם. לא בוצע חיוב.',
              'The payment did not complete. You were not charged.',
            ));
            // The intent is spent; a retry needs a fresh one against the same order.
            this.intentSignal.set(null);
            break;
        }
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.paymentStatusSignal.set(PaymentStatus.Failed);
        const appError = toAppError(error);
        this.paymentFailureSignal.set(appError.userMessage);
        this.notifications.error(appError);
        this.intentSignal.set(null);
        return of(null);
      }),
    );
  }

  /** Polls a pending payment, for the timeout branch. */
  refreshPaymentStatus(): Observable<PaymentResult | null> {
    const intent = this.intentSignal();
    if (!intent) {
      return of(null);
    }
    return this.paymentApi.getStatus(intent.id).pipe(
      tap((result) => this.paymentStatusSignal.set(result.status)),
      catchError(() => of(null)),
    );
  }

  /**
   * Abandons a payment the gateway is still holding.
   *
   * The timeout branch left the customer with a disabled pay button, a status
   * that never changed and no way out except leaving the site. Cancelling is
   * safe: the provider refuses to cancel an intent that has already settled, so
   * this can never revoke a payment that actually went through.
   */
  cancelPayment(): Observable<PaymentResult | null> {
    const intent = this.intentSignal();
    if (!intent) {
      return of(null);
    }
    this.busySignal.set(true);

    return this.paymentApi.cancel(intent.id).pipe(
      tap((result) => {
        this.busySignal.set(false);
        this.paymentStatusSignal.set(result.status);
        if (result.status === PaymentStatus.Cancelled) {
          this.paymentFailureSignal.set(localized(
            'התשלום בוטל. אפשר לנסות שוב או לחזור לעגלה.',
            'The payment was cancelled. You can try again or go back to your cart.',
          ));
        }
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  reset(): void {
    this.forgetSessionId();
    this.sessionSignal.set(null);
    this.intentSignal.set(null);
    this.issuesSignal.set([]);
    this.orderIdSignal.set(null);
    this.instrumentsSignal.set([]);
    this.paymentFailureSignal.set(null);
    this.paymentStatusSignal.set(null);
  }

  // --- Session continuity ---------------------------------------------------
  // Wrapped in try/catch throughout: a browser in private mode, or with storage
  // disabled, throws on access. Losing continuity is acceptable there; throwing
  // in the middle of a checkout is not.

  private rememberSessionId(id: CheckoutSessionId): void {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      // No continuity across a reload in this browser. Checkout still works.
    }
  }

  private readSessionId(): CheckoutSessionId | null {
    try {
      return (sessionStorage.getItem(SESSION_KEY) as CheckoutSessionId | null) ?? null;
    } catch {
      return null;
    }
  }

  private forgetSessionId(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to clean up.
    }
  }
}
