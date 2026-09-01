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
 * size and everything else arranges around it. The previous hero led with a
 * sentence and put the price in a small chip underneath.
 *
 * On a phone the price and the button sit on the first screen, with the artwork
 * behind the copy rather than beside it. Nobody scrolls past a decorative panel
 * to find out what something costs.
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
        <span class="rule"></span>
      </div>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="kicker">{{ gameName }}</p>

          <h1>
            הקוינס שלך.
            <span class="hl">במחיר שעושה את ההבדל.</span>
          </h1>

          <div class="deal" *ngIf="best as price">
            <span class="deal__from">מ־</span>
            <span class="deal__value">{{ price }}</span>
            <span class="deal__unit">₪ למיליון</span>
          </div>

          <p class="sub">
            בוחרים חבילה, משלמים, ומקבלים. הפלטפורמה, אזור החנות וזמן האספקה
            מופיעים לפני התשלום.
          </p>

          <div class="cta">
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
              קנו קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
            <a class="tt-btn tt-btn--ghost tt-btn--lg" href="#bundles">לכל החבילות</a>
          </div>
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
      padding-block: calc(var(--tt-header-height) + var(--tt-space-7)) var(--tt-space-7);
    }

    .hero__ground { position: absolute; inset: 0; z-index: -1; }
    /* One wash. Two blurred orbs and a grid field read as a template. */
    .wash {
      position: absolute;
      inset-block-start: -40%;
      inset-inline-end: -10%;
      inline-size: min(70vw, 760px);
      block-size: min(70vw, 760px);
      border-radius: 50%;
      background: var(--tt-brand-500);
      opacity: 0.16;
      filter: blur(120px);
    }
    .rule {
      position: absolute;
      inset-block-end: 0;
      inset-inline: 0;
      block-size: 1px;
      background: linear-gradient(90deg, transparent, var(--tt-border-strong), transparent);
    }

    .hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: center;
      gap: var(--tt-space-6);
    }

    .copy { display: flex; flex-direction: column; align-items: flex-start; }

    .kicker {
      margin: 0 0 var(--tt-space-3);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: var(--tt-tracking-eyebrow);
      color: var(--tt-brand-300);
    }

    h1 {
      margin: 0;
      font-size: clamp(2.1rem, 6.4vw, 3.6rem);
      line-height: 1.08;
      letter-spacing: -0.025em;
      max-inline-size: 14ch;
    }
    .hl { display: block; color: var(--tt-gold-400); }

    /* The number is the argument, so it is the largest thing on the screen. */
    .deal {
      display: flex;
      align-items: baseline;
      gap: var(--tt-space-2);
      margin-block-start: var(--tt-space-5);
    }
    .deal__from { color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .deal__value {
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: clamp(3rem, 11vw, 4.6rem);
      font-weight: 900;
      line-height: 0.9;
      letter-spacing: -0.04em;
      color: var(--tt-gold-400);
    }
    .deal__unit { color: var(--tt-text-muted); font-size: var(--tt-text-md); font-weight: 600; }

    .sub {
      margin: var(--tt-space-4) 0 0;
      max-inline-size: 42ch;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-md);
      line-height: var(--tt-leading);
    }

    .cta {
      display: flex;
      gap: var(--tt-space-3);
      flex-wrap: wrap;
      margin-block-start: var(--tt-space-5);
    }
    /* Keeps a two-word label on one line whatever the container does. */
    .cta .tt-btn { white-space: nowrap; }

    .art { display: flex; justify-content: center; }
    .art tt-coin-tier { inline-size: min(100%, 400px); }

    @media (max-width: 900px) {
      .hero { padding-block: calc(var(--tt-header-height) + var(--tt-space-5)) var(--tt-space-6); }
      .hero__inner { grid-template-columns: 1fr; }
      /* The artwork moves behind the copy instead of below it, so the price and
         the button stay on the first screen. */
      /* A real object rather than a faint wash. At 20% opacity it read as a
         smudge behind the headline, which is worse than no artwork at all. It
         sits clear of the text and keeps its own weight. */
      .art {
        position: absolute;
        /* Below the header: at the top of the hero the artwork sat under the
           menu and cart icons and made them unreadable. */
        inset-block-start: calc(var(--tt-header-height) + var(--tt-space-2));
        inset-inline-end: -14%;
        inline-size: 50%;
        opacity: 0.8;
        z-index: -1;
        pointer-events: none;
      }
      .copy { position: relative; }
      h1 { max-inline-size: 11ch; }

      /* The primary action takes the full row. Forcing both buttons onto one
         line wrapped "קנו קוינס" across two lines inside an oval. */
      .cta { inline-size: 100%; flex-direction: column; align-items: stretch; }
      .cta .tt-btn { inline-size: 100%; }
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
