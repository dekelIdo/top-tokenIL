import { Injectable, signal } from '@angular/core';

import { LocalizedText } from '../../domain';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: LocalizedText;
}

/**
 * Toast queue. Deliberately tiny: an append-only signal of messages plus a timer
 * per entry. Replacing Angular Material's snackbar with this removed the overlay
 * and theming stack from the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  private sequence = 0;

  readonly toasts = this.items.asReadonly();

  show(message: LocalizedText, tone: ToastTone = 'info', durationMs = 4000): void {
    this.sequence += 1;
    const toast: Toast = { id: this.sequence, tone, message };
    this.items.set([...this.items(), toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  dismiss(id: number): void {
    this.items.set(this.items().filter((toast) => toast.id !== id));
  }
}
