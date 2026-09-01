import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { STOREFRONT } from '../../core/brand';
import { rankByValue } from '../../core/value';
import { ProductDetail } from '../../domain';
import { CoinTierComponent } from './coin-tier.component';
import { IconComponent } from './icon.component';

/**
 * The opening screen.
 *
 * Built around one claim the catalog can actually back: what a million coins
 * costs at the best tier. That number is the business, so it is set at display
 * size and everything else arranges around it.
 *
 * The composition is deliberately not headline / paragraph / button. That
 * arrangement is the default shape of a generated landing page, and it makes a
 * shop look like a brochure for a shop. Here the price sits in a rule-bound
 * block with its own unit and its own supporting line, the way a figure is set
 * in print, and three plain facts run along the bottom edge with no cards
 * around them.
 *
 * Everything is real. The figure is computed from priced offers; if the catalog
 * has not loaded, the block is absent rather than showing a placeholder.
 */
@Component({
  selector: 'tt-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, CoinTierComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div class="hero__ground" aria-hidden="true">
        <span class="wash"></span>
        <!-- Diagonal bands cut at the same angle as the brand mark. Cheap,
             original, and it gives the ground a direction instead of a blur. -->
        <span class="bands"></span>
      </div>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="kicker"><span class="kicker__dot"></span>{{ gameName }}</p>

          <h1>
            יותר קוינס.
            <span class="hl">פחות כסף.</span>
          </h1>

          <!-- The price block: a figure, its unit, and what it is a price of. -->
          <div class="deal" *ngIf="best as price">
            <div class="deal__figure">
              <span class="deal__from">מ־</span>
              <span class="deal__value tt-numeric">{{ price }}</span>
              <span class="deal__currency">₪</span>
            </div>
            <div class="deal__note">
              <span class="deal__unit">לכל מיליון קוינס</span>
              <span class="deal__sub">בחבילה הגדולה. המחיר של כל חבילה מופיע למטה.</span>
            </div>
          </div>

          <div class="cta">
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
              בחרו חבילה <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
            <a class="compare" href="#bundles">השוואת כל החבילות</a>
          </div>

          <!-- Three facts on a rule. Not four cards. -->
          <ul class="facts">
            <li>מחיר סופי לפני תשלום</li>
            <li>אשראי דרך ספק סליקה</li>
            <li>מעקב הזמנה</li>
          </ul>
        </div>

        <div class="art" aria-hidden="true">
          <tt-coin-tier tier="hero"></tt-coin-tier>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .hero {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      margin-block-start: calc(var(--tt-header-height) * -1);
      padding-block: calc(var(--tt-header-height) + var(--tt-space-6)) var(--tt-space-6);
      border-block-end: 1px solid var(--tt-border);
    }

    .hero__ground { position: absolute; inset: 0; z-index: -1; }
    .wash {
      position: absolute;
      inset-block-start: -45%;
      inset-inline-end: -12%;
      inline-size: min(72vw, 720px);
      block-size: min(72vw, 720px);
      border-radius: 50%;
      background: var(--tt-brand-500);
      opacity: 0.13;
      filter: blur(130px);
    }
    /* Repeating sheared bands, fading downward. The angle is the mark's. */
    .bands {
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(
        99deg,
        var(--tt-border) 0 1px,
        transparent 1px 74px
      );
      -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.85), transparent 78%);
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.85), transparent 78%);
    }

    .hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      align-items: center;
      gap: var(--tt-space-6);
    }

    .copy { display: flex; flex-direction: column; align-items: flex-start; }

    .kicker {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: 0 0 var(--tt-space-3);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: var(--tt-tracking-eyebrow);
      color: var(--tt-text-muted);
    }
    /* Lime is liveness in this system, and this is its only appearance up here. */
    .kicker__dot {
      inline-size: 6px;
      block-size: 6px;
      border-radius: 50%;
      background: var(--tt-accent-500);
      flex: none;
    }

    h1 {
      margin: 0;
      font-size: clamp(2.6rem, 11vw, 4.2rem);
      line-height: 0.98;
      letter-spacing: -0.035em;
      font-weight: 900;
    }
    .hl { display: block; color: var(--tt-gold-400); }

    /* The figure and its explanation, joined by a rule rather than boxed. */
    .deal {
      display: flex;
      align-items: center;
      gap: var(--tt-space-4);
      margin-block-start: var(--tt-space-5);
      padding-inline-start: var(--tt-space-4);
      border-inline-start: 2px solid var(--tt-gold-500);
    }
    .deal__figure { display: flex; align-items: baseline; gap: 2px; }
    .deal__from { color: var(--tt-text-faint); font-size: var(--tt-text-sm); }
    .deal__value {
      font-size: clamp(2.8rem, 10vw, 4rem);
      font-weight: 900;
      line-height: 0.86;
      letter-spacing: -0.045em;
      color: var(--tt-gold-400);
    }
    .deal__currency {
      font-size: var(--tt-text-xl);
      font-weight: 700;
      color: var(--tt-gold-400);
    }
    .deal__note { display: flex; flex-direction: column; gap: 2px; }
    .deal__unit { font-size: var(--tt-text-sm); font-weight: 700; }
    .deal__sub {
      font-size: var(--tt-text-xs);
      color: var(--tt-text-faint);
      line-height: var(--tt-leading-snug);
      max-inline-size: 24ch;
    }

    .cta {
      display: flex;
      gap: var(--tt-space-3);
      flex-wrap: wrap;
      margin-block-start: var(--tt-space-5);
    }
    .cta .tt-btn { white-space: nowrap; }

    /* The secondary action is a link, not a second button. Two full-width
       rectangles stacked on a phone gave the screen no primary action and cost
       seventy pixels above the fold to say so. */
    .compare {
      align-self: center;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 4px;
      text-decoration-color: var(--tt-border-strong);
    }
    .compare:hover { color: var(--tt-text); }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tt-space-2) var(--tt-space-4);
      margin: var(--tt-space-5) 0 0;
      padding-block-start: var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
      inline-size: 100%;
      list-style: none;
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
    }
    .facts li { display: flex; align-items: center; gap: var(--tt-space-2); }
    .facts li + li::before {
      content: '';
      inline-size: 3px;
      block-size: 3px;
      border-radius: 50%;
      background: currentColor;
      margin-inline-end: var(--tt-space-2);
    }

    .art { display: flex; justify-content: center; }
    .art tt-coin-tier { inline-size: min(100%, 380px); }

    @media (max-width: 900px) {
      .hero { padding-block: calc(var(--tt-header-height) + var(--tt-space-4)) var(--tt-space-5); }
      .hero__inner { grid-template-columns: 1fr; }

      /* The artwork bleeds off the trailing edge behind the copy, so the price
         and the button still land on the first screen. Cropping it is what
         makes it read as art direction rather than as a picture dropped into a
         box below the text. */
      .art {
        position: absolute;
        inset-block-start: calc(var(--tt-header-height) + var(--tt-space-1));
        inset-inline-end: -22%;
        inline-size: 62%;
        opacity: 0.55;
        z-index: -1;
        pointer-events: none;
      }
      .copy { position: relative; }

      .art { opacity: 0.5; }

      .deal { gap: var(--tt-space-3); }
      .deal__sub { display: none; }
    }

    /* Full-width action on a phone only. Stretched across a 768px tablet the
       button ran the whole measure and stopped reading as a control. */
    @media (max-width: 620px) {
      .cta { inline-size: 100%; flex-direction: column; align-items: stretch; }
      .cta .tt-btn { inline-size: 100%; }
      .compare { align-self: center; }
    }
  `],
})
export class HeroComponent {
  readonly gameName = STOREFRONT.focusGameName;

  /** Cheapest price per million in the catalog, in whole shekels. */
  best: string | null = null;

  @Input() set ladder(detail: ProductDetail | null | undefined) {
    this.best = this.cheapestPerMillion(detail);
  }

  private cheapestPerMillion(detail: ProductDetail | null | undefined): string | null {
    if (!detail) {
      return null;
    }

    const rates = rankByValue(detail.offers, detail.product.variants)
      .map((row) => row.perUnitMinor)
      .filter((value): value is number => value !== undefined);

    if (rates.length === 0) {
      return null;
    }

    // Whole shekels: a headline figure carrying agorot reads as precision
    // nobody asked for.
    return Math.round(Math.min(...rates) / 100).toLocaleString('he-IL');
  }
}
