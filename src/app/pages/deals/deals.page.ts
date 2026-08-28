import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';

import { AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { Promotion, PromotionKind } from '../../domain';
import { PromotionApiService } from '../../data/api';
import { CatalogFacade } from '../../state';
import { EmptyStateComponent, ProductCardComponent } from '../../ui';

/**
 * Active promotions and the discounted products behind them. Nothing here is a
 * banner without a destination — every promotion links into the catalog.
 */
@Component({
  selector: 'tt-deals-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, ProductCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <span class="tt-eyebrow">מבצעים</span>
      <h1>דילים פעילים</h1>

      <ng-container *ngIf="vm$ | async as vm">
        <tt-empty-state *ngIf="vm.promotions.length === 0"
                        icon="🏷️"
                        title="אין מבצעים פעילים כרגע"
                        message="שווה לחזור לבדוק — מבצעים מתחלפים.">
        </tt-empty-state>

        <div class="tt-grid promos" *ngIf="vm.promotions.length > 0">
          <article class="tt-card tt-card--pad" *ngFor="let promotion of vm.promotions">
            <span class="tt-badge tt-badge--accent">{{ kindLabel(promotion) }}</span>
            <h2>{{ promotion.title | t }}</h2>
            <p class="tt-muted">{{ promotion.description | t }}</p>
            <a class="tt-btn tt-btn--ghost tt-btn--sm" routerLink="/store">לצפייה במוצרים</a>
          </article>
        </div>

        <section class="tt-section">
          <div class="tt-section__head"><h2>מוצרים במחיר מיוחד</h2></div>

          <tt-empty-state *ngIf="vm.discounted.length === 0"
                          icon="💸"
                          title="אין כרגע מוצרים מוזלים"
                          message="אפשר לעיין בכל הקטלוג בינתיים.">
          </tt-empty-state>

          <div class="tt-grid" *ngIf="vm.discounted.length > 0">
            <tt-product-card *ngFor="let product of vm.discounted" [product]="product" [lookups]="vm.lookups">
            </tt-product-card>
          </div>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    h1 { margin-block: var(--tt-space-1) var(--tt-space-4); }
    .promos h2 { font-size: var(--tt-text-lg); margin-block: var(--tt-space-2) var(--tt-space-1); }
    .tt-section__head h2 { font-size: var(--tt-text-xl); }
    .promos p { font-size: var(--tt-text-sm); }
  `],
})
export class DealsPage {
  private readonly promotionApi = inject(PromotionApiService);
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly vm$ = combineLatest([
    this.promotionApi.getActivePromotions(),
    this.catalog.search({ sort: 'price-asc', page: { page: 1, pageSize: 24 } }),
    this.catalog.lookups$,
  ]).pipe(
    map(([promotions, page, lookups]) => ({
      promotions,
      lookups,
      // A product counts as "on deal" when its cheapest offer has a compare-at price.
      discounted: page.items.filter((product) => product.fromPrice?.compareAt !== undefined),
    })),
  );

  constructor() {
    this.analytics.pageView('/deals', 'Deals');
  }

  kindLabel(promotion: Promotion): string {
    return promotion.kind === PromotionKind.PercentOff ? 'הנחה באחוזים' : 'הנחה בסכום';
  }
}
