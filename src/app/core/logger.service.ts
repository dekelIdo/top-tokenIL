import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

/**
 * The only sanctioned way to write to the console.
 *
 * Diagnostics are silenced in production, and callers must pass a short message
 * plus optional non-sensitive context — never a cart, an order, a payment payload
 * or anything a customer typed.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, context?: Record<string, string | number | boolean>): void {
    if (environment.debugLogging) {
      // eslint-disable-next-line no-console
      console.debug(`[easycoins] ${message}`, context ?? '');
    }
  }

  warn(message: string, context?: Record<string, string | number | boolean>): void {
    if (environment.debugLogging) {
      console.warn(`[easycoins] ${message}`, context ?? '');
    }
  }

  /** Errors are always reported; the message must already be sanitised. */
  error(message: string, context?: Record<string, string | number | boolean>): void {
    console.error(`[easycoins] ${message}`, context ?? '');
  }
}
