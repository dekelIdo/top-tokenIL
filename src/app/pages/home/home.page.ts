import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';

import { AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { PageRequest } from '../../domain';
import { PromotionApiService, ReviewApiService, SupportApiService } from '../../data/api';
import { CatalogFacade } from '../../state';
import {
  FaqAccordionComponent, GameCardComponent, ProductCardComponent, ReviewCardComponent,
  SkeletonGridComponent, TrustBadgesComponent,
} from '../../ui';

const REVIEW_PAGE: PageRequest = { page: 1, pageSize: 3 };

/**
 * The storefront landing page: what we sell, which games, why we can be trusted,
 * and what customers said. Everything on it is real data from the catalog — there
 * is no decorative content that does not link somewhere.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    GameCardComponent, ProductCardComponent, ReviewCardComponent, FaqAccordionComponent,
    TrustBadgesComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div class="tt-container hero__inner">
        <span class="tt-eyebrow">חנות גיימינג ישראלית</span>
        <h1>קודים, מנויים ומטבעות משחק בלי הפתעות</h1>
        <p class="lead tt-muted">
          כל מוצר מציג מראש את הפלטפורמה, את אזור החנות ואת זמן האספקה המשוער.
          אנחנו לא מבקשים סיסמאות, ולא מבטיחים אספקה שאיננו יכולים לעמוד בה.
        </p>
        <div class="tt-row">
          <a class="tt-btn tt-btn--primary" routerLink="/store">לכל המוצרים</a>
          <a class="tt-btn tt-btn--ghost" routerLink="/games">לפי משחק</a>
        </div>
        <tt-trust-badges class="trust"></tt-trust-badges>
      </div>
    </section>

    <section class="tt-container tt-section">
      <div class="tt-section__head">
        <h2>מוצרים מומלצים</h2>
        <a routerLink="/store">לכל המוצרים →</a>
      </div>

      <ng-container *ngIf="vm$ | async as vm; else loading">
        <div class="tt-grid reserve-grid">
          <tt-product-card *ngFor="let product of vm.featured"
                           [product]="product"
                           [lookups]="vm.lookups">
          </tt-product-card>
        </div>
      </ng-container>
      <ng-template #loading><tt-skeleton-grid [count]="4"></tt-skeleton-grid></ng-template>
    </section>

    <section class="tt-container tt-section">
      <div class="tt-section__head">
        <h2>משחקים</h2>
        <a routerLink="/games">כל המשחקים →</a>
      </div>
      <div class="tt-grid reserve-promos">
        <tt-game-card *ngFor="let game of games$ | async" [game]="game"></tt-game-card>
      </div>
    </section>

    <section class="tt-container tt-section" *ngIf="promotions$ | async as promotions">
      <div class="tt-section__head" *ngIf="promotions.length > 0">
        <h2>מבצעים פעילים</h2>
        <a routerLink="/deals">לכל המבצעים →</a>
      </div>
      <div class="tt-grid reserve-promos" *ngIf="promotions.length > 0">
        <article class="tt-card tt-card--pad" *ngFor="let promotion of promotions">
          <span class="tt-badge tt-badge--accent">מבצע</span>
          <h3>{{ promotion.title | t }}</h3>
          <p class="tt-muted">{{ promotion.description | t }}</p>
        </article>
      </div>
    </section>

    <section class="tt-container tt-section">
      <div class="tt-section__head">
        <h2>מה לקוחות אומרים</h2>
        <a routerLink="/reviews">כל הביקורות →</a>
      </div>
      <div class="tt-grid reserve-reviews">
        <tt-review-card *ngFor="let review of (reviews$ | async)" [review]="review"></tt-review-card>
      </div>
    </section>

    <section class="tt-container tt-section">
      <div class="tt-section__head">
        <h2>שאלות נפוצות</h2>
        <a routerLink="/faq">כל השאלות →</a>
      </div>
      <tt-faq-accordion class="reserve-faq" [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
    </section>
  `,
  styles: [`
    .hero {
      padding-block: var(--tt-space-8) var(--tt-space-7);
      background:
        radial-gradient(circle at 80% 0%, var(--tt-brand-tint), transparent 55%),
        radial-gradient(circle at 10% 20%, var(--tt-accent-tint), transparent 45%);
    }
    .hero__inner { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-3); }
    .hero h1 { font-size: clamp(2rem, 5vw, var(--tt-text-4xl)); max-inline-size: 18ch; margin: 0; }
    .lead { max-inline-size: 60ch; font-size: var(--tt-text-lg); }
    .trust { display: block; inline-size: 100%; margin-block-start: var(--tt-space-5); }
    /* Async sections reserve their height so late-arriving data cannot push the
       page around under the reader. */
    .reserve-grid { min-block-size: 358px; }
    .reserve-promos { min-block-size: 190px; }
    .reserve-reviews { min-block-size: 220px; }
    .reserve-faq { min-block-size: 260px; }
    article h3 { margin-block: var(--tt-space-2) var(--tt-space-1); font-size: var(--tt-text-lg); }
    article p { margin: 0; font-size: var(--tt-text-sm); }
  `],
})
export class HomePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly promotionApi = inject(PromotionApiService);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly supportApi = inject(SupportApiService);
  private readonly analytics = inject(AnalyticsService);

  readonly games$ = this.catalog.games$;
  readonly promotions$ = this.promotionApi.getActivePromotions();
  readonly reviews$ = this.reviewApi.getReviews(REVIEW_PAGE).pipe(map((page) => page.items));
  readonly faq$ = this.supportApi.getFaq().pipe(map((entries) => entries.slice(0, 4)));

  readonly vm$ = combineLatest([this.catalog.featured(4), this.catalog.lookups$]).pipe(
    map(([featured, lookups]) => ({ featured, lookups })),
  );

  constructor() {
    this.analytics.pageView('/', 'Home');
  }
}
