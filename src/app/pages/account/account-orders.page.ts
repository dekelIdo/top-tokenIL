import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { OrderFacade } from '../../state';
import { EmptyStateComponent, MoneyPipe } from '../../ui';

/**
 * Order history.
 *
 * Orders are server records. The mock backend keeps them in memory only, so this
 * list is empty after a reload — that is the honest behaviour, and the page says
 * so rather than faking persistence the platform does not have yet.
 */
@Component({
  selector: 'tt-account-orders-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>ההזמנות שלי</h1>

      <ng-container *ngIf="orders$ | async as orders">
        <tt-empty-state *ngIf="orders.length === 0"
                        icon="📦"
                        title="אין הזמנות להצגה"
                        message="הזמנות נשמרות בשרת. כל עוד האתר בפיתוח, ההיסטוריה מתאפסת ברענון הדף.">
        </tt-empty-state>

        <ul class="list" *ngIf="orders.length > 0">
          <li class="tt-card tt-card--pad" *ngFor="let order of orders">
            <div class="row">
              <strong>{{ order.reference }}</strong>
              <span>{{ order.totals.total | money }}</span>
            </div>
            <div class="row tt-faint">
              <span>{{ order.createdAt | date:'d MMM yyyy, HH:mm' }}</span>
              <span>{{ order.items.length }}</span>
            </div>
            <a class="tt-btn tt-btn--ghost tt-btn--sm" [routerLink]="['/account/order', order.id]">
              לצפייה בהזמנה
            </a>
          </li>
        </ul>
      </ng-container>
    </div>
  `,
  styles: [`
    h1 { margin-block-end: var(--tt-space-5); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .row { display: flex; justify-content: space-between; gap: var(--tt-space-3); margin-block-end: var(--tt-space-2); }
  `],
})
export class AccountOrdersPage {
  private readonly orderFacade = inject(OrderFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly orders$ = this.orderFacade.orders();

  constructor() {
    this.analytics.pageView('/account/orders', 'Account orders');
  }
}
