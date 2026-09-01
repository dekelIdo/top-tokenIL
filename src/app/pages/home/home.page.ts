import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, concat, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CoinPlan } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { PageRequest, Product, ProductType } from '../../domain';
import { ReviewApiService, SupportApiService } from '../../data/api';
import { CartFacade, CatalogFacade } from '../../state';
import {
  AmountSelectorComponent,
  BundleLadderComponent, FaqAccordionComponent, HeroComponent, IconComponent,
  ProductCardComponent, ReviewCardComponent, SkeletonGridComponent,
} from '../../ui';

const REVIEW_PAGE: PageRequest = { page: 1, pageSize: 2 };

/**
 * The landing page.
 *
 * Six blocks, not nine. The page previously ran hero, ladder, products, games,
 * how-it-works, trust, deals, reviews, FAQ and a final call, each in its own
 * full-width band with its own heading. That is a deck, not a shop: it made the
 * page enormous and every section look like the last one.
 *
 * What is left earns its place:
 *
 *   1. Hero, with a real price in it
 *   2. Bundles, which is the product and the price argument in one block
 *   3. Everything else we sell for this game
 *   4. How buying works, folded together with the reassurance that used to be
 *      its own band of four identical cards
 *   5. What people asked, and what a couple of them said
 *   6. The last call
 *
 * The games rail is gone. The shop sells one game, and a rail of one is worse
 * than no rail.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    BundleLadderComponent, HeroComponent, IconComponent, AmountSelectorComponent,
    ProductCardComponent, ReviewCardComponent, FaqAccordionComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [ladder]="vm.ladder"></tt-hero>

      <!-- 2. The question the shop exists to answer, directly under the hero.
           It was only reachable from the store, which meant the homepage could
           show a price but not let anyone act on it. -->
      <section class="tt-container tt-section chooser" *ngIf="vm.ladder as ladder">
        <tt-amount-selector [detail]="ladder"
                            [busy]="adding()"
                            (confirm)="addPlan($event)">
        </tt-amount-selector>
      </section>

      <!-- 3. The bundles. The product and the price argument in one block. -->
      <section class="tt-container tt-section" id="bundles" *ngIf="vm.ladder as ladder">
        <header class="band">
          <div>
            <h2>חבילות קוינס</h2>
            <p class="lede">ככל שהחבילה גדולה יותר, המחיר לכל מיליון יורד. הכול מוצג לצד כל חבילה.</p>
          </div>
          <a class="ghost-link" [routerLink]="['/products', ladder.product.slug]">
            כל האפשרויות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
          </a>
        </header>

        <tt-bundle-ladder [detail]="ladder" [productSlug]="ladder.product.slug"></tt-bundle-ladder>
      </section>

      <!-- 3. The rest of the shelf for this game. -->
      <section class="tt-container tt-section" *ngIf="vm.products.length > 0">
        <header class="band">
          <div>
            <h2>עוד ל{{ gameName }}</h2>
            <p class="lede">קודים, נקודות ושירותים לאותו חשבון.</p>
          </div>
          <a class="ghost-link" routerLink="/store">
            לחנות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
          </a>
        </header>

        <div class="tt-grid">
          <tt-product-card *ngFor="let product of vm.products"
                           [product]="product"
                           [lookups]="vm.lookups">
          </tt-product-card>
        </div>
      </section>
    </ng-container>

    <ng-template #loading>
      <tt-hero></tt-hero>
      <section class="tt-container tt-section"><tt-skeleton-grid [count]="4"></tt-skeleton-grid></section>
    </ng-template>

    <!-- 4. How buying works, with the reassurance folded in rather than given a
         band of four identical cards of its own. -->
    <section class="tt-section steps-band">
      <div class="tt-container">
        <h2 class="steps-band__title">שלושה צעדים, בלי הפתעות</h2>

        <ol class="steps">
          <li>
            <span class="steps__n">1</span>
            <h3>בוחרים חבילה</h3>
            <p>המחיר, הפלטפורמה ואזור החנות מופיעים לפני התשלום.</p>
          </li>
          <li>
            <span class="steps__n">2</span>
            <h3>משלמים</h3>
            <p>פרטי האשראי עוברים לספק הסליקה. אצלנו הם לא נשמרים.</p>
          </li>
          <li>
            <span class="steps__n">3</span>
            <h3>מקבלים</h3>
            <p>לכל הזמנה יש דף מעקב עם הסטטוס, מהתשלום ועד האספקה.</p>
          </li>
        </ol>

        <p class="promise">
          <tt-icon name="shield" [size]="17"></tt-icon>
          לא מבקשים סיסמה לחשבון המשחק, לא קוד אימות ולא קודי גיבוי. בשום שלב.
        </p>
      </div>
    </section>

    <!-- 5. Questions, and a couple of things customers said. -->
    <section class="tt-container tt-section">
      <div class="split">
        <div>
          <h2>שאלות שחוזרות</h2>
          <tt-faq-accordion class="reserve-faq" [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
          <a class="ghost-link" routerLink="/faq">
            עוד שאלות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
          </a>
        </div>

        <aside class="says" *ngIf="(reviews$ | async) as reviews">
          <ng-container *ngIf="reviews.length > 0">
            <h2>מה אמרו</h2>
            <tt-review-card *ngFor="let review of reviews" [review]="review"></tt-review-card>
            <a class="ghost-link" routerLink="/reviews">
              כל הביקורות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
            </a>
          </ng-container>
        </aside>
      </div>
    </section>

    <!-- 6. The last call. -->
    <section class="tt-container tt-section">
      <div class="closer">
        <h2>מוכנים?</h2>
        <p>בחרו חבילה, ראו את המחיר, וסיימו תוך דקה.</p>
        <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
          לקניית קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
        </a>
      </div>
    </section>
  `,
  styles: [`
    h2 {
      margin: 0;
      font-size: var(--tt-display-2);
      letter-spacing: var(--tt-tracking-display);
      line-height: var(--tt-leading-tight);
    }

    /* A section head with no eyebrow above it. The eyebrow was the same shape on
       every band and added a line of noise to each. */
    /* Set on a raised ground so the purchase control separates from the bands
       of catalogue below it without being put in a box. */
    .chooser {
      background:
        radial-gradient(70% 120% at 50% 0%, var(--tt-brand-tint), transparent 68%),
        var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      max-inline-size: none;
      padding-inline: var(--tt-gutter);
    }

    .band {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: var(--tt-space-4);
      margin-block-end: var(--tt-space-5);
      flex-wrap: wrap;
    }
    .lede {
      margin: var(--tt-space-2) 0 0;
      max-inline-size: 48ch;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      line-height: var(--tt-leading);
    }

    .ghost-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      white-space: nowrap;
    }
    .ghost-link:hover { color: var(--tt-brand-300); text-decoration: none; }

    /* The one place on the page with a different ground, which is what stops the
       page reading as one long column of identical bands. */
    .steps-band {
      background:
        radial-gradient(80% 120% at 50% 0%, var(--tt-brand-tint), transparent 70%),
        var(--tt-bg-elevated);
      border-block: 1px solid var(--tt-border);
    }
    .steps-band__title { margin-block-end: var(--tt-space-5); }

    .steps {
      display: grid;
      gap: var(--tt-space-5);
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* No card, no border, no background. The number carries the structure. */
    .steps__n {
      display: block;
      font-family: var(--tt-font-numeric);
      font-size: var(--tt-text-3xl);
      font-weight: 900;
      line-height: 1;
      color: var(--tt-brand-500);
      margin-block-end: var(--tt-space-2);
    }
    .steps h3 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-md); }
    .steps p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }

    .promise {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: var(--tt-space-6) 0 0;
      padding-block-start: var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
    }
    .promise tt-icon { color: var(--tt-brand-400); flex: none; }

    .split {
      display: grid;
      gap: var(--tt-space-7);
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
      align-items: start;
    }
    .split h2 { margin-block-end: var(--tt-space-4); }
    .split .ghost-link { margin-block-start: var(--tt-space-3); }
    .says { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .reserve-faq { min-block-size: 240px; }

    .closer {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-3);
      padding-block: var(--tt-space-7);
    }
    .closer p { margin: 0; color: var(--tt-text-muted); }

    @media (max-width: 860px) {
      .split { grid-template-columns: 1fr; gap: var(--tt-space-6); }
    }
  `],
})
export class HomePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly cart = inject(CartFacade);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly supportApi = inject(SupportApiService);
  private readonly analytics = inject(AnalyticsService);

  readonly gameName = STOREFRONT.focusGameName;

  readonly reviews$ = this.reviewApi.getReviews(REVIEW_PAGE).pipe(map((page) => page.items));
  readonly faq$ = this.supportApi.getFaq().pipe(map((entries) => entries.slice(0, 5)));

  /**
   * The catalog for the game this shop sells.
   *
   * Filtered by game rather than by taking whatever is featured, so the page
   * cannot quietly start advertising a product from a game the storefront does
   * not present.
   */
  readonly vm$ = combineLatest([
    this.catalog.productsForGame(STOREFRONT.focusGameSlug),
    this.catalog.lookups$,
  ]).pipe(
    switchMap(([products, lookups]) => {
      const coins = products.find(
        (product): product is Product => product.type === ProductType.GameCurrency,
      );

      // Everything except the coin bundles, which have their own block above.
      const rest = products.filter((product) => product.id !== coins?.id);

      if (!coins) {
        return of({ products: rest, lookups, ladder: null });
      }

      return this.catalog.productBySlug(coins.slug).pipe(
        map((ladder) => ({ products: rest, lookups, ladder })),
        catchError(() => of({ products: rest, lookups, ladder: null })),
      );
    }),
  );

  /** Set while a plan is being added, so the button cannot be double-pressed. */
  readonly adding = signal(false);

  /**
   * Adds every bundle in the plan to the cart.
   *
   * The plan is a list of offers the server priced; this only posts them.
   * Sequential rather than parallel: the cart merges by offer, and several
   * writes at once against one line is how a quantity gets lost.
   */
  addPlan(plan: CoinPlan): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);

    concat(...plan.lines.map((line) => this.cart.add({
      offerId: line.offer.id,
      quantity: line.count,
    }))).subscribe({
      complete: () => this.adding.set(false),
      error: () => this.adding.set(false),
    });
  }

  constructor() {
    this.analytics.pageView('/', 'Home');
  }
}
