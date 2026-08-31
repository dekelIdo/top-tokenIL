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
  FaqAccordionComponent, GameCardComponent, HeroComponent, IconComponent,
  ProductCardComponent, ReviewCardComponent, SkeletonGridComponent, TrustBadgesComponent,
} from '../../ui';

const REVIEW_PAGE: PageRequest = { page: 1, pageSize: 3 };

/**
 * The landing page.
 *
 * Deliberately not five identical blocks. The page previously ran the same
 * "heading, link, grid" shape five times, which is what made it read as
 * generated rather than designed. Each section now earns its own treatment: the
 * hero shows a real priced product, games run as a horizontal rail, promotions
 * sit on a raised ground, and reassurance appears once rather than being
 * sprinkled everywhere.
 *
 * Everything on it is real catalog data. Nothing is decorative filler and every
 * block links somewhere.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    GameCardComponent, HeroComponent, IconComponent, ProductCardComponent,
    ReviewCardComponent, FaqAccordionComponent, TrustBadgesComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [product]="vm.featured[0]"></tt-hero>

      <section class="tt-container tt-section">
        <header class="tt-section__head">
          <div>
            <p class="tt-eyebrow">נבחרו עבורכם</p>
            <h2>מוצרים מומלצים</h2>
          </div>
          <a class="more" routerLink="/store">
            לכל המוצרים <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
        </header>

        <div class="tt-grid reserve-grid">
          <tt-product-card *ngFor="let product of vm.featured"
                           [product]="product"
                           [lookups]="vm.lookups">
          </tt-product-card>
        </div>
      </section>
    </ng-container>

    <ng-template #loading>
      <tt-hero [product]="null"></tt-hero>
      <section class="tt-container tt-section">
        <tt-skeleton-grid [count]="4"></tt-skeleton-grid>
      </section>
    </ng-template>

    <!-- Games. A rail rather than a grid: there are few of them, they are wide,
         and a rail scrolls naturally on a phone instead of stacking. -->
    <section class="tt-section tt-section--raised">
      <div class="tt-container">
        <header class="tt-section__head">
          <div>
            <p class="tt-eyebrow">לפי משחק</p>
            <h2>מה משחקים היום</h2>
          </div>
          <a class="more" routerLink="/games">
            כל המשחקים <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
        </header>

        <div class="rail reserve-rail">
          <tt-game-card *ngFor="let game of games$ | async" [game]="game"></tt-game-card>
        </div>
      </div>
    </section>

    <section class="tt-container tt-section" *ngIf="promotions$ | async as promotions">
      <ng-container *ngIf="promotions.length > 0">
        <header class="tt-section__head">
          <div>
            <p class="tt-eyebrow">פעיל עכשיו</p>
            <h2>מבצעים</h2>
          </div>
          <a class="more" routerLink="/deals">
            לכל המבצעים <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
        </header>

        <div class="promos">
          <article class="promo" *ngFor="let promotion of promotions">
            <tt-icon name="tag" [size]="18"></tt-icon>
            <div>
              <h3>{{ promotion.title | t }}</h3>
              <p>{{ promotion.description | t }}</p>
            </div>
          </article>
        </div>
      </ng-container>
    </section>

    <!-- Reassurance appears once, here, rather than repeating on every section. -->
    <section class="tt-container tt-section tt-section--tight">
      <tt-trust-badges></tt-trust-badges>
    </section>

    <!-- Reviews and questions share a row on a wide screen: two short blocks
         side by side, instead of two more full-width bands. -->
    <section class="tt-container tt-section">
      <div class="split">
        <div>
          <header class="tt-section__head">
            <h2>מה לקוחות אומרים</h2>
            <a class="more" routerLink="/reviews">
              הכל <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
            </a>
          </header>
          <div class="tt-stack reserve-reviews">
            <tt-review-card *ngFor="let review of (reviews$ | async)" [review]="review"></tt-review-card>
          </div>
        </div>

        <div>
          <header class="tt-section__head">
            <h2>שאלות נפוצות</h2>
            <a class="more" routerLink="/faq">
              הכל <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
            </a>
          </header>
          <tt-faq-accordion class="reserve-faq" [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
        </div>
      </div>
    </section>
  `,
  styles: [`
    h2 { margin: 0; font-size: var(--tt-text-2xl); letter-spacing: var(--tt-tracking-display); }
    .tt-section__head p { margin: 0 0 var(--tt-space-1); }

    .more {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-1);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      white-space: nowrap;
    }
    .more:hover { color: var(--tt-brand-300); text-decoration: none; }

    /* Games rail: scrolls horizontally, snaps, and hides its scrollbar. */
    .rail {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(240px, 1fr);
      gap: var(--tt-space-4);
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      padding-block-end: var(--tt-space-2);
      scrollbar-width: none;
    }
    .rail::-webkit-scrollbar { display: none; }
    .rail > * { scroll-snap-align: start; }

    .promos {
      display: grid;
      gap: var(--tt-space-4);
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .promo {
      display: flex;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      /* A gold hairline on the leading edge marks it as an offer without
         wrapping the whole card in colour. */
      border-inline-start: 3px solid var(--tt-gold-500);
    }
    .promo tt-icon { color: var(--tt-gold-400); margin-block-start: 2px; }
    .promo h3 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-md); }
    .promo p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }

    .split {
      display: grid;
      gap: var(--tt-space-7);
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      align-items: start;
    }

    /* Async sections reserve their height so late data cannot push the page
       around under the reader. */
    .reserve-grid { min-block-size: 340px; }
    .reserve-rail { min-block-size: 172px; }
    .reserve-reviews { min-block-size: 220px; }
    .reserve-faq { min-block-size: 260px; }

    @media (max-width: 700px) {
      h2 { font-size: var(--tt-text-xl); }
    }
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
