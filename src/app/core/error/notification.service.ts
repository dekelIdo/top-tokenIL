import { Injectable, inject } from '@angular/core';

import { AppError, LocalizedText } from '../../domain';
import { ToastService } from './toast.service';

/**
 * User-facing messaging. Only `AppError.userMessage` is ever shown: technical
 * detail and stack traces stay in the console, never in front of a customer.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toasts = inject(ToastService);

  success(message: LocalizedText): void {
    this.toasts.show(message, 'success');
  }

  info(message: LocalizedText): void {
    this.toasts.show(message, 'info');
  }

  error(error: AppError): void {
    this.toasts.show(error.userMessage, 'error', 6500);
  }
}
