import { Component, Input, computed, signal } from '@angular/core';

/**
 * A fulfillment status, in Hebrew, colour-coded.
 *
 * The word carries the meaning and the colour only emphasises it, so the queue
 * still reads correctly in greyscale.
 */
@Component({
  selector: 'admin-status-pill',
  standalone: true,
  template: `<span class="pill" [class]="tone()">{{ label() }}</span>`,
})
export class StatusPillComponent {
  private readonly value = signal('');

  @Input({ required: true })
  set status(status: string) {
    this.value.set(status);
  }

  readonly label = computed(() => LABELS[this.value()] ?? this.value());
  readonly tone = computed(() => TONES[this.value()] ?? '');
}

const LABELS: Record<string, string> = {
  PENDING: 'ממתין',
  PROCESSING: 'בטיפול',
  WAITING_FOR_CUSTOMER: 'ממתין ללקוח',
  READY: 'מוכן',
  DELIVERED: 'סופק',
  FAILED: 'נכשל',
  CANCELLED: 'בוטל',
  REFUNDED: 'זוכה',
};

const TONES: Record<string, string> = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  WAITING_FOR_CUSTOMER: 'waiting',
  READY: 'processing',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  CANCELLED: 'failed',
  REFUNDED: 'failed',
};
