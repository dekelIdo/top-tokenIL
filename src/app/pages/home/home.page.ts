import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { PageRequest, Product, ProductType } from '../../domain';
import { PromotionApiService, ReviewApiService, SupportApiService } from '../../data/api';
import { CatalogFacade } from '../../state';
import {
  BundleLadderComponent, FaqAccordionComponent, GameCardComponent, HeroComponent,
  IconComponent, ProductCardComponent, ReviewCardComponent, SkeletonGridComponent,
  TrustBadgesComponent,
} from '../../ui';

const REVIEW_PAGE: PageRequest = { page: 1, pageSize: 3 };

/**
 * The landing page, built as a purchase funnel rather than a brochure.
 *
 * The order answers a customer's questions in the order they actually ask them:
 * what is this and what does it cost, which bundle should I buy, what else do
 * you sell, how does delivery work, can I trust you, and what if something goes
 * wrong. Each section exists because it removes one objection.
 *
 * The bundle ladder is the commercial centre of the page. ZuzCOINS competes on
 * price, so the interface shows the price-per-million relationship directly
 * instead of asserting good value in copy.
 *
 * Everything is real catalog data. No invented statistic, review count or
 * guarantee appears anywhere on this page.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    BundleLadderComponent, GameCardComponent, HeroComponent, IconComponent,
    ProductCardComponent, ReviewCardComponent, FaqAccordionComponent,
    TrustBadgesComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [product]="vm.featured[0]" [ladder]="vm.ladder"></tt-hero>

      <!-- 1. The price argument, immediately after the hero. -->
      <section class="tt-container tt-section" *ngIf="vm.ladder as ladder">
        <header class="tt-section__head">
          <div>
            <p class="tt-eyebrow">כמה זה עולה</p>
            <h2>ככל שקונים יותר, המחיר למיליון יורד</h2>
            <p class="sub tt-muted">
              המחיר לכל מיליון מוצג לצד כל חבילה, כדי שתראו בדיוק מה משתלם.
            </p>
          </div>
          <a class="more" [routerLink]="['/products', ladder.product.slug]">
            כל החבילות <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
        </header>

        <div class="ladder-wrap">
          <tt-bundle-ladder [detail]="ladder" [productSlug]="ladder.product.slug"></tt-bundle-ladder>

          <aside class="ladder-note">
            <h3>למה המחיר למיליון חשוב</h3>
            <p class="tt-muted">
              חבילה גדולה כמעט תמיד זולה יותר לכל מיליון. במקום להשוות מספרים בראש,
              המחיר ליחידה מופיע ליד כל אפשרות, והחבילה המשתלמת ביותר מסומנת.
            </p>
            <a class="tt-btn tt-btn--buy" [routerLink]="['/products', ladder.product.slug]">
              לבחירת חבילה
              <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
          </aside>
        </div>
      </section>

      <!-- 2. What else is on the shelf. -->
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
      <tt-hero></tt-hero>
      <section class="tt-container tt-section">
        <tt-skeleton-grid [count]="4"></tt-skeleton-grid>
      </section>
    </ng-template>

    <!-- 3. Which game. A rail, because there are few and they are wide. -->
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

    <!-- 4. How it actually works. The commonest objection is "what happens
         after I pay", so it is answered before the customer has to ask. -->
    <section class="tt-container tt-section">
      <header class="tt-section__head">
        <div>
          <p class="tt-eyebrow">איך זה עובד</p>
          <h2>מהתשלום ועד שהמוצר אצלכם</h2>
        </div>
      </header>

      <ol class="steps">
        <li>
          <span class="steps__num">1</span>
          <h3>בוחרים חבילה</h3>
          <p>פלטפורמה, אזור חנות ומחיר מופיעים על כל אפשרות לפני שמשלמים.</p>
        </li>
        <li>
          <span class="steps__num">2</span>
          <h3>ממלאים פרטים</h3>
          <p>רק מה שצריך כדי לספק את המוצר. לא מבקשים סיסמה ולא קוד אימות, בשום שלב.</p>
        </li>
        <li>
          <span class="steps__num">3</span>
          <h3>משלמים</h3>
          <p>פרטי האשראי נמסרים לספק הסליקה ולא נשמרים אצלנו.</p>
        </li>
        <li>
          <span class="steps__num">4</span>
          <h3>מקבלים עדכון</h3>
          <p>לכל הזמנה יש דף מעקב עם הסטטוס העדכני, מהתשלום ועד האספקה.</p>
        </li>
      </ol>
    </section>

    <!-- 5. Reassurance, once. -->
    <section class="tt-container tt-section tt-section--tight">
      <tt-trust-badges></tt-trust-badges>
    </section>

    <!-- 6. Live offers, if there are any. -->
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

    <!-- 7. What people said, and what people ask. -->
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

    <!-- 8. The last ask. -->
    <section class="tt-container tt-section">
      <div class="final">
        <h2>מוכנים להתחיל?</h2>
        <p class="tt-muted">בחרו משחק, בחרו חבילה, וראו את המחיר לפני שאתם משלמים.</p>
        <div class="final__cta">
          <a class="tt-btn tt-btn--buy" routerLink="/store">
            לחנות <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
          </a>
          <a class="tt-btn tt-btn--ghost" routerLink="/support">יש לי שאלה</a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    h2 { margin: 0; font-size: var(--tt-text-2xl); letter-spacing: var(--tt-tracking-display); }
    .tt-section__head p { margin: 0 0 var(--tt-space-1); }
    .sub { max-inline-size: 52ch; font-size: var(--tt-text-sm); margin-block-start: var(--tt-space-2); }

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

    .ladder-wrap {
      display: grid;
      gap: var(--tt-space-5);
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: start;
    }
    .ladder-note {
      padding: var(--tt-space-5);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
    }
    .ladder-note h3 { margin: 0 0 var(--tt-space-2); font-size: var(--tt-text-lg); }
    .ladder-note p { margin: 0 0 var(--tt-space-4); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }

    /* Games rail: scrolls horizontally, snaps, hides its scrollbar. */
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

    .steps {
      display: grid;
      gap: var(--tt-space-4);
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: step;
    }
    .steps li {
      padding: var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
    }
    .steps__num {
      display: grid;
      place-items: center;
      inline-size: 30px;
      block-size: 30px;
      margin-block-end: var(--tt-space-3);
      border-radius: var(--tt-radius-md);
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
      font-family: var(--tt-font-numeric);
      font-weight: 800;
    }
    .steps h3 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-md); }
    .steps p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }

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

    .final {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-3);
      padding: var(--tt-space-7) var(--tt-space-5);
      border-radius: var(--tt-radius-xl);
      background:
        radial-gradient(circle at 50% 0%, var(--tt-brand-tint), transparent 60%),
        var(--tt-surface);
      border: 1px solid var(--tt-border);
    }
    .final p { margin: 0; }
    .final__cta { display: flex; gap: var(--tt-space-3); flex-wrap: wrap; justify-content: center; }

    /* One row of the compact card, so late data does not shift the page. */
    .reserve-grid { min-block-size: 260px; }
    .reserve-rail { min-block-size: 172px; }
    .reserve-reviews { min-block-size: 220px; }
    .reserve-faq { min-block-size: 260px; }

    @media (max-width: 900px) {
      .ladder-wrap { grid-template-columns: 1fr; }
    }
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
    switchMap(([featured, lookups]) => {
      // The ladder needs a product with quantity tiers to compare. Chosen by
      // product type rather than by slug: hard-coding one game's slug is how a
      // storefront quietly becomes single-game again.
      const ladderProduct = featured.find(
        (product): product is Product => product.type === ProductType.GameCurrency,
      );

      if (!ladderProduct) {
        return of({ featured, lookups, ladder: null });
      }

      return this.catalog.productBySlug(ladderProduct.slug).pipe(
        map((ladder) => ({ featured, lookups, ladder })),
        // A failed detail request costs the page one module, not the page.
        catchError(() => of({ featured, lookups, ladder: null })),
      );
    }),
  );

  constructor() {
    this.analytics.pageView('/', 'Home');
  }
}
