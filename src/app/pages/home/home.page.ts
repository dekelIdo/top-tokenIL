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
  ValueStripComponent,
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
    ValueStripComponent,
    ProductCardComponent, ReviewCardComponent, FaqAccordionComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [ladder]="vm.ladder"></tt-hero>

      <!-- The promises, on a rule directly under the hero rather than in a
           section of their own. They are a caption to the hero, not a chapter. -->
      <div class="promises">
        <div class="tt-container">
          <h2 class="tt-visually-hidden">למה EASYCOINS</h2>
          <tt-value-strip></tt-value-strip>
        </div>
      </div>

      <!-- ONE buying band, on its own ground.
           The purchase control, the tier ladder and the rest of the shelf used
           to be three sections with identical padding and identical headers,
           which is what made the page read as a list. They are one act: choose
           an amount, or choose a bundle, or see what else there is. Putting
           them on a single raised ground with internal rules says that. -->
      <div class="buy" id="bundles">
        <div class="tt-container">
          <section class="buy__pick" *ngIf="vm.ladder as ladder">
            <tt-amount-selector [detail]="ladder"
                                [busy]="adding()"
                                (confirm)="addPlan($event)">
            </tt-amount-selector>
          </section>

          <section class="buy__tiers" *ngIf="vm.ladder as ladder">
            <header class="band">
              <h2>או חבילה מוכנה</h2>
              <a class="ghost-link" [routerLink]="['/products', ladder.product.slug]">
                כל האפשרויות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
              </a>
            </header>
            <tt-bundle-ladder [detail]="ladder" [productSlug]="ladder.product.slug"></tt-bundle-ladder>
          </section>

          <section class="buy__shelf" *ngIf="vm.products.length > 0">
            <header class="band">
              <h2>עוד ל{{ gameName }}</h2>
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
        </div>
      </div>
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

    <!-- The close: the questions that stop a purchase, and the purchase,
         side by side. They used to be two centred sections in a row, the second
         of which was a card containing one sentence and a button. -->
    <section class="tt-container tt-section close">
      <div class="close__ask">
        <h2>שאלות שחוזרות</h2>
        <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
        <a class="ghost-link" routerLink="/faq">
          עוד שאלות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
        </a>
      </div>

      <aside class="close__act">
        <p class="close__kicker">מוכנים?</p>
        <p class="close__line">בוחרים כמות, רואים מחיר, מסיימים.</p>
        <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
          לקניית קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
        </a>
      </aside>
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
    /* The promises sit between two rules, tight against the hero. A band this
       thin reads as a caption to what is above it, which is what it is. */
    .promises {
      padding-block: var(--tt-space-5);
      border-block-end: 1px solid var(--tt-border);
    }

    /* The buying band: one ground, three acts, separated by rules rather than
       by gaps. Alternating the ground is what gives the page chapters; three
       sections with identical padding gave it a list. */
    .buy {
      background:
        radial-gradient(80% 100% at 50% 0%, var(--tt-brand-tint), transparent 62%),
        var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      padding-block: var(--tt-section-y);
    }
    .buy__tiers, .buy__shelf {
      margin-block-start: var(--tt-section-y);
      padding-block-start: var(--tt-space-6);
      border-block-start: 1px solid var(--tt-border);
    }

    /* The close. Questions take the width, the purchase takes the corner: an
       asymmetric pair rather than two centred blocks stacked. */
    .close {
      display: grid;
      gap: var(--tt-space-7);
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
      align-items: start;
    }
    .close__ask h2 { margin-block-end: var(--tt-space-4); }
    .close__ask .ghost-link { margin-block-start: var(--tt-space-4); }

    .close__act {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tt-space-3);
      padding-inline-start: var(--tt-space-5);
      border-inline-start: 2px solid var(--tt-gold-500);
    }
    .close__kicker {
      margin: 0;
      font-size: var(--tt-display-2);
      font-weight: 900;
      line-height: 1;
      letter-spacing: var(--tt-tracking-display);
    }
    .close__line { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }

    @media (max-width: 860px) {
      .close { grid-template-columns: 1fr; gap: var(--tt-space-6); }
      .close__act {
        padding-inline-start: 0;
        padding-block-start: var(--tt-space-5);
        border-inline-start: 0;
        border-block-start: 1px solid var(--tt-border);
        align-self: stretch;
      }
      .close__act .tt-btn { inline-size: 100%; }
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
