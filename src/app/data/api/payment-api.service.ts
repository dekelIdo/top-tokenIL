import { Observable } from 'rxjs';
import {
  CheckoutSessionId, PaymentInstrumentRef, PaymentIntentId, PaymentProviderId, PaymentResult,
  PaymentSession,
} from '../../domain';

/**
 * Provider-agnostic payment boundary.
 *
 * No method accepts card details: the provider collects them in a hosted field or
 * a redirect, so PAN/CVV never reach this application. `confirm` only tells the
 * backend that the customer completed the provider-side step.
 */
export abstract class PaymentApiService {
  abstract createSession(checkoutSessionId: CheckoutSessionId, provider: PaymentProviderId): Observable<PaymentSession>;
  /**
   * Confirms the provider-side step. `instrument` carries only the opaque token
   * the provider issued — never card data.
   *
   * Must be idempotent: confirming an intent that already settled returns the
   * settled result instead of charging or creating anything a second time.
   */
  abstract confirm(intentId: PaymentIntentId, instrument: PaymentInstrumentRef): Observable<PaymentResult>;
  abstract cancel(intentId: PaymentIntentId): Observable<PaymentResult>;
  abstract getStatus(intentId: PaymentIntentId): Observable<PaymentResult>;
}
