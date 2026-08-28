import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';

import { toAppError } from '../../domain';
import { LoggerService } from '../logger.service';
import { NotificationService } from './notification.service';

/**
 * Last line of defence. Anything that escapes a facade is normalised into an
 * AppError, logged with its technical message, and surfaced to the customer as
 * plain Hebrew — never as a stack trace.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logger = inject(LoggerService);
  private readonly notifications = inject(NotificationService);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    const appError = toAppError(error);
    this.logger.error(`${appError.kind}: ${appError.technicalMessage}`, {
      status: appError.status ?? 0,
      retryable: appError.retryable,
    });
    this.zone.run(() => this.notifications.error(appError));
  }
}
