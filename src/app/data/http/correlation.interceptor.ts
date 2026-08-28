import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { newIdempotencyKey } from './idempotency';

/**
 * Attaches a correlation id to every request.
 *
 * The backend echoes it into its structured logs and into the error envelope, so
 * a customer saying "my order failed at 14:03" becomes a single log query. The
 * id is per-request and carries no personal data.
 */
@Injectable()
export class CorrelationInterceptor implements HttpInterceptor {
  /** Stable for the browsing session, so one visit can be followed end to end. */
  private readonly sessionId = newIdempotencyKey();

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request.clone({
      setHeaders: {
        'X-Request-Id': newIdempotencyKey(),
        'X-Session-Trace': this.sessionId,
      },
    }));
  }
}
