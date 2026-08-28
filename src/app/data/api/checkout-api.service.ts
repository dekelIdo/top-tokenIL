import { Observable } from 'rxjs';
import {
  Cart, CheckoutFieldValues, CheckoutSession, CheckoutSessionId, CheckoutSubmitResult,
} from '../../domain';

export abstract class CheckoutApiService {
  /** Builds a session whose requirements are derived from the offers in the cart. */
  abstract createSession(cart: Cart): Observable<CheckoutSession>;
  abstract getSession(id: CheckoutSessionId): Observable<CheckoutSession>;
  abstract submitDetails(id: CheckoutSessionId, values: CheckoutFieldValues): Observable<CheckoutSubmitResult>;
}
