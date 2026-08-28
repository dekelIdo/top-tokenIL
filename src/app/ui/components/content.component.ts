import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LocalizePipe } from '../../core/i18n';
import {
  FaqEntry, Fulfillment, FulfillmentStatus, ORDER_STATUS_FLOW, OrderStatus, Review,
} from '../../domain';
import { StarRatingComponent } from './star-rating.component';

/** Trust signals. Each claim here is one the platform can actually keep. */
@Component({
  selector: 'tt-trust-badges',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      <li *ngFor="let signal of signals">
        <span class="glyph" aria-hidden="true">{{ signal.icon }}</span>
        <span>
          <strong>{{ signal.title }}</strong>
          <span class="tt-faint">{{ signal.detail }}</span>
        </span>
      </li>
    </ul>
  `,
  styles: [`
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--tt-space-3);
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: var(--tt-space-3);
      padding: var(--tt-space-3);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface-2);
      border: 1px solid var(--tt-border);
    }
    .glyph { font-size: 1.4rem; line-height: 1.2; }
    strong { display: block; font-size: var(--tt-text-sm); }
    .tt-faint { display: block; }
  `],
})
export class TrustBadgesComponent {
  readonly signals = [
    { icon: '🔒', title: 'לא מבקשים סיסמאות', detail: 'לעולם לא נבקש סיסמה או קוד אימות' },
    { icon: '🌍', title: 'אזור מוצג מראש', detail: 'האזור של כל קוד מוצג לפני התשלום' },
    { icon: '⚡', title: 'זמן אספקה גלוי', detail: 'הזמן המשוער מופיע על כל מוצר' },
    { icon: '🇮🇱', title: 'תמיכה בעברית', detail: 'צוות ישראלי, מענה בעברית' },
  ];
}

@Component({
  selector: 'tt-review-card',
  standalone: true,
  imports: [CommonModule, StarRatingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="tt-panel">
      <header>
        <strong>{{ review.authorDisplayName }}</strong>
        <span class="tt-badge tt-badge--success" *ngIf="review.verifiedPurchase">רכישה מאומתת</span>
      </header>
      <tt-star-rating [rating]="review.rating"></tt-star-rating>
      <h3 *ngIf="review.title">{{ review.title }}</h3>
      <p class="tt-muted">{{ review.body }}</p>
      <time class="tt-faint" [attr.datetime]="review.createdAt">{{ review.createdAt | date:'d MMM yyyy' }}</time>
    </article>
  `,
  styles: [`
    article { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    header { display: flex; align-items: center; gap: var(--tt-space-2); justify-content: space-between; }
    h3 { margin: 0; font-size: var(--tt-text-md); }
    p { margin: 0; font-size: var(--tt-text-sm); }
  `],
})
export class ReviewCardComponent {
  @Input({ required: true }) review!: Review;
}

/** Native disclosure widget — keyboard accessible without any JavaScript. */
@Component({
  selector: 'tt-faq-accordion',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="list">
      <details class="item" *ngFor="let entry of entries">
        <summary>{{ entry.question | t }}</summary>
        <p class="tt-muted">{{ entry.answer | t }}</p>
      </details>
    </div>
  `,
  styles: [`
    .list { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .item {
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      padding: var(--tt-space-4);
    }
    summary { cursor: pointer; font-weight: 600; }
    summary::marker { color: var(--tt-brand-500); }
    p { margin-block: var(--tt-space-3) 0; font-size: var(--tt-text-sm); }
  `],
})
export class FaqAccordionComponent {
  @Input() entries: readonly FaqEntry[] = [];
}

/**
 * Order lifecycle timeline. Terminal failure states are rendered as their own
 * step rather than being squeezed into the happy path.
 */
@Component({
  selector: 'tt-order-status-timeline',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="timeline">
      <li *ngFor="let step of steps" [class.done]="step.done" [class.current]="step.current">
        <span class="dot" aria-hidden="true"></span>
        <span class="label">{{ step.label }}</span>
      </li>
    </ol>
    <p class="tt-alert tt-alert--danger" *ngIf="isFailed">
      ההזמנה נעצרה. צוות התמיכה שלנו יצור איתכם קשר, ואפשר גם לפנות אלינו מדף התמיכה.
    </p>
  `,
  styles: [`
    .timeline {
      list-style: none;
      margin: 0 0 var(--tt-space-4);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-4);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      color: var(--tt-text-faint);
      position: relative;
    }
    li:not(:last-child)::after {
      content: '';
      position: absolute;
      inset-block-start: 22px;
      inset-inline-start: 7px;
      inline-size: 2px;
      block-size: calc(100% + var(--tt-space-4) - 22px);
      background: var(--tt-border);
    }
    .dot {
      inline-size: 16px;
      block-size: 16px;
      border-radius: 50%;
      border: 2px solid var(--tt-border-strong);
      background: var(--tt-surface);
      flex: none;
      z-index: 1;
    }
    li.done { color: var(--tt-text); }
    li.done .dot { background: var(--tt-success); border-color: var(--tt-success); }
    li.current { color: var(--tt-text); font-weight: 600; }
    li.current .dot { border-color: var(--tt-brand-500); box-shadow: 0 0 0 4px var(--tt-brand-tint); }
  `],
})
export class OrderStatusTimelineComponent {
  @Input() status: OrderStatus = OrderStatus.PendingPayment;

  private static readonly LABELS: Readonly<Record<string, string>> = {
    [OrderStatus.PendingPayment]: 'ממתין לתשלום',
    [OrderStatus.PaymentProcessing]: 'התשלום בעיבוד',
    [OrderStatus.Paid]: 'התשלום התקבל',
    [OrderStatus.FulfillmentProcessing]: 'ההזמנה בהכנה',
    [OrderStatus.Fulfilled]: 'ההזמנה סופקה',
  };

  get isFailed(): boolean {
    return this.status === OrderStatus.Failed || this.status === OrderStatus.Cancelled;
  }

  get steps(): readonly { label: string; done: boolean; current: boolean }[] {
    const currentIndex = ORDER_STATUS_FLOW.indexOf(this.status);
    return ORDER_STATUS_FLOW.map((status, index) => ({
      label: OrderStatusTimelineComponent.LABELS[status] ?? status,
      done: currentIndex >= 0 && index < currentIndex,
      current: index === currentIndex,
    }));
  }
}

/** Renders what a customer actually received for one order line. */
@Component({
  selector: 'tt-delivery-payload',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-panel" *ngIf="fulfillment">
      <ng-container [ngSwitch]="fulfillment.delivery?.payload?.kind">
        <div *ngSwitchCase="'CODE'" class="code">
          <span class="tt-faint">הקוד שלכם</span>
          <code>{{ code }}</code>
          <span class="tt-hint">קוד הדגמה בסביבת פיתוח — אינו ניתן למימוש.</span>
        </div>
        <p *ngSwitchDefault class="tt-muted">{{ statusLabel }}</p>
      </ng-container>
      <p class="tt-error" *ngIf="fulfillment.failureReason">{{ fulfillment.failureReason | t }}</p>
    </div>
  `,
  styles: [`
    .code { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    code {
      font-size: var(--tt-text-lg);
      letter-spacing: 0.08em;
      background: var(--tt-surface-3);
      padding: var(--tt-space-2) var(--tt-space-3);
      border-radius: var(--tt-radius-sm);
      direction: ltr;
      text-align: center;
    }
  `],
})
export class DeliveryPayloadComponent {
  @Input() fulfillment?: Fulfillment;

  get code(): string {
    const payload = this.fulfillment?.delivery?.payload;
    return payload?.kind === 'CODE' ? payload.code : '';
  }

  get statusLabel(): string {
    switch (this.fulfillment?.status) {
      case FulfillmentStatus.Processing:
        return 'ההזמנה בהכנה. נעדכן אתכם ברגע שתסופק.';
      case FulfillmentStatus.WaitingForCustomer:
        return 'ממתינים לפרטים מכם כדי להשלים את האספקה.';
      case FulfillmentStatus.Pending:
        return 'ממתין לאישור התשלום.';
      case FulfillmentStatus.Cancelled:
        return 'האספקה בוטלה.';
      case FulfillmentStatus.Refunded:
        return 'בוצע החזר כספי.';
      default:
        return 'סופק.';
    }
  }
}
