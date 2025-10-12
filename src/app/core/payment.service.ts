import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { PaymentPayload, PaymentResult } from './models';

/**
 * PaymentService: Simulates payment processing for credit card, PayPal, and digital wallet.
 * Provides processPayment method with simulated network delay and random success/failure.
 * Singleton service provided in CoreModule.
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  /**
   * Simulate payment processing with ~2s delay and 80% success rate.
   */
  processPayment(payload: PaymentPayload): Observable<PaymentResult> {
    return of(payload).pipe(
      delay(2000),
      map(() => {
        const success = Math.random() < 0.8;
        return {
          success,
          transactionId: success ? Math.random().toString(36).substr(2, 9) : undefined,
          message: success ? 'התשלום הושלם בהצלחה!' : 'התשלום נכשל. אנא נסה שוב.'
        };
      })
    );
  }
} 