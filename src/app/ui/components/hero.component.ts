import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Product, ProductDetail } from '../../domain';
import { rankByValue } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { MoneyPipe } from '../money.pipe';
import { IconComponent } from './icon.component';

/**
 * The landing hero.
 *
 * Composed as two columns rather than text floating over a gradient: a copy
 * block on one side, and on the other a real product from the catalog, priced.
 * That second half is the argument. A visitor sees within a second that this is
 * a shop with things in it and what they cost, instead of a slogan.
 *
 * The product is passed in rather than fetched here, so the hero renders the
 * same card the store does and cannot drift from it.
 *
 * Art direction differs by width. On a phone the two columns become one and the
 * product moves below the copy, because a half-height decorative panel above the
 * fold on a 360px screen costs the headline its space.
 */
@Component({
  selector: 'tt-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <!-- Decorative ground. Marked hidden so a screen reader is not told about
           a shape that carries no information. -->
      <div class="hero__ground" aria-hidden="true">
        <span class="orb orb--brand"></span>
        <span class="orb orb--gold"></span>
        <span class="grid"></span>
      </div>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="tt-eyebrow">חנות גיימינג ישראלית</p>

          <h1>
            מטבעות, קודים ומנויים
            <span class="accent">שמגיעים מהר</span>
          </h1>

          <p class="lead">
            כל מוצר מציג את הפלטפורמה, את אזור החנות ואת זמן האספקה לפני התשלום.
            לא מבקשים סיסמה, ולא מבטיחים מה שאי אפשר לקיים.
          </p>

          <!-- Commercial proof, not a slogan. The cheapest price per million in
               the catalogue, computed from real offers. Rendered only when a
               bundle with a quantity actually exists. -->
          <div class="proof" *ngIf="bestPerUnit as best">
            <span class="proof__label">מ־</span>
            <span class="proof__value">{{ best.text }}</span>
            <span class="proof__unit">למיליון קוינס</span>
          </div>

          <div class="cta">
            <a class="tt-btn tt-btn--primary" routerLink="/store">
              לחנות
              <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
            <a class="tt-btn tt-btn--ghost" routerLink="/games">לפי משחק</a>
          </div>

          <ul class="points">
            <li><tt-icon name="clock" [size]="16"></tt-icon> זמן אספקה גלוי מראש</li>
            <li><tt-icon name="globe" [size]="16"></tt-icon> אזור חנות מסומן לכל מוצר</li>
            <li><tt-icon name="shield" [size]="16"></tt-icon> בלי סיסמאות ובלי פרטי אשראי אצלנו</li>
          </ul>
        </div>

        <!-- The featured product. Rendered only when the catalog has one, so the
             column collapses cleanly rather than showing an empty frame. -->
        <aside class="showcase" *ngIf="product as item">
          <a class="showcase__card" [routerLink]="['/products', item.slug]">
            <span class="showcase__tag">
              <tt-icon name="bolt" [size]="14"></tt-icon> מומלץ
            </span>

            <div class="showcase__stage">
              <img *ngIf="item.images[0] as image"
                   [src]="image.url"
                   [alt]="image.alt"
                   width="240" height="180"
                   fetchpriority="high" />
            </div>

            <div class="showcase__body">
              <h2>{{ item.name | t }}</h2>
              <p>{{ item.shortDescription | t }}</p>

              <div class="showcase__foot">
                <span class="tt-faint">החל מ־</span>
                <span class="tt-price tt-price--lg">{{ item.fromPrice?.current | money }}</span>
              </div>
            </div>
          </a>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    .hero {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      /* Pulls up under the transparent header so the ground runs behind it. */
      margin-block-start: calc(var(--tt-header-height) * -1);
      padding-block: calc(var(--tt-header-height) + var(--tt-space-8)) var(--tt-space-8);
    }

    .hero__ground { position: absolute; inset: 0; z-index: -1; }

    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
    }
    /* Kept low. These are depth behind the composition, not the composition
       itself; at full strength they washed the headline out and the hero read
       as a gradient with text on top. */
    .orb--brand {
      inline-size: 30vw; block-size: 30vw;
      max-inline-size: 420px; max-block-size: 420px;
      inset-block-start: -12%;
      inset-inline-start: 2%;
      background: var(--tt-brand-500);
      opacity: 0.22;
    }
    .orb--gold {
      inline-size: 22vw; block-size: 22vw;
      max-inline-size: 300px; max-block-size: 300px;
      inset-block-end: -14%;
      inset-inline-end: 4%;
      background: var(--tt-gold-500);
      opacity: 0.14;
    }
    /* A faint field, not a decorative flourish: it gives the blurred colour
       something to sit against so the ground reads as a surface. */
    .grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(var(--tt-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--tt-border) 1px, transparent 1px);
      background-size: 72px 72px;
      mask-image: radial-gradient(ellipse at 50% 0%, #000 15%, transparent 65%);
      opacity: 0.35;
    }

    .hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      align-items: center;
      gap: var(--tt-space-7);
    }

    .copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-4); }

    h1 {
      margin: 0;
      font-size: clamp(2.25rem, 5.2vw, var(--tt-text-5xl));
      line-height: var(--tt-leading-tight);
      letter-spacing: var(--tt-tracking-display);
      max-inline-size: 15ch;
    }
    .accent {
      display: block;
      background: linear-gradient(100deg, var(--tt-gold-400), var(--tt-gold-600));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .lead {
      margin: 0;
      max-inline-size: 46ch;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-lg);
      line-height: var(--tt-leading);
    }

    /* The price proof sits between the promise and the button, where the eye
       lands after reading the headline. */
    .proof {
      display: flex;
      align-items: baseline;
      gap: var(--tt-space-2);
      padding: var(--tt-space-3) var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-gold-tint);
      border: 1px solid rgba(245, 185, 66, 0.28);
    }
    .proof__label { color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .proof__value {
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-3xl);
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.02em;
      color: var(--tt-gold-400);
    }
    .proof__unit { color: var(--tt-text-muted); font-size: var(--tt-text-sm); }

    .cta { display: flex; gap: var(--tt-space-3); flex-wrap: wrap; }

    .points {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-2);
      margin: var(--tt-space-2) 0 0;
      padding: 0;
      list-style: none;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
    }
    .points li { display: flex; align-items: center; gap: var(--tt-space-2); }
    .points tt-icon { color: var(--tt-brand-400); }

    .showcase { display: flex; justify-content: center; }

    .showcase__card {
      position: relative;
      inline-size: min(100%, 380px);
      padding: var(--tt-space-5);
      border-radius: var(--tt-radius-xl);
      background:
        linear-gradient(160deg, var(--tt-surface-2), var(--tt-surface));
      border: 1px solid var(--tt-border-strong);
      box-shadow: var(--tt-shadow-3);
      color: inherit;
      text-decoration: none;
      transition: transform var(--tt-duration) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .showcase__card:hover {
      transform: translateY(-4px);
      box-shadow: var(--tt-shadow-3), var(--tt-ring-brand);
      text-decoration: none;
    }

    .showcase__tag {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-1);
      padding: 0.25rem 0.7rem;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-gold-tint);
      color: var(--tt-gold-400);
      font-size: var(--tt-text-xs);
      font-weight: 700;
    }

    /* The illustration gets a stage of its own rather than floating in the
       card's padding, which left it looking small in a large dark box. */
    .showcase__stage {
      display: grid;
      place-items: center;
      margin-block: var(--tt-space-4);
      padding-block: var(--tt-space-5);
      border-radius: var(--tt-radius-lg);
      background:
        radial-gradient(circle at 50% 120%, var(--tt-gold-tint), transparent 65%),
        var(--tt-bg-elevated);
      border: 1px solid var(--tt-border);
    }
    .showcase__stage img {
      display: block;
      inline-size: min(100%, 220px);
      block-size: auto;
    }

    .showcase__body h2 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-xl); }
    .showcase__body p {
      margin: 0;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      line-height: var(--tt-leading-snug);
    }

    .showcase__foot {
      display: flex;
      align-items: baseline;
      gap: var(--tt-space-2);
      margin-block-start: var(--tt-space-4);
      padding-block-start: var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
    }

    /* Tablet: the showcase narrows before it stacks. */
    @media (max-width: 1024px) {
      .hero__inner { gap: var(--tt-space-5); }
      .showcase__card { inline-size: min(100%, 330px); }
    }

    /* Phone: one column, and the product follows the copy. A decorative panel
       above the fold would cost the headline the space it needs. */
    @media (max-width: 860px) {
      .hero { padding-block-end: var(--tt-space-6); }
      .hero__inner { grid-template-columns: 1fr; }
      .showcase { justify-content: stretch; }
      .showcase__card { inline-size: 100%; }
      .points { font-size: var(--tt-text-xs); }
    }
  `],
})
export class HeroComponent {
  /** The product to showcase. Absent renders the copy column alone. */
  @Input() product?: Product | null;

  /**
   * The coin product's offers, used for the price proof. Optional: the hero
   * renders without it rather than waiting.
   */
  @Input() set ladder(detail: ProductDetail | null | undefined) {
    this.bestPerUnit = this.cheapestPerUnit(detail);
  }

  /** Cheapest price per million in the catalogue, or null when none applies. */
  bestPerUnit: { text: string } | null = null;

  private cheapestPerUnit(detail: ProductDetail | null | undefined): { text: string } | null {
    if (!detail) {
      return null;
    }

    const ranked = rankByValue(detail.offers, detail.product.variants)
      .map((row) => row.perUnitMinor)
      .filter((value): value is number => value !== undefined);

    if (ranked.length === 0) {
      return null;
    }

    const cheapest = Math.min(...ranked);
    const currency = detail.offers[0]?.price.current.currency ?? 'ILS';

    // Formatted here rather than through the money pipe because the value is a
    // derived rate, and rounding it to whole shekels keeps the headline number
    // readable.
    const shekels = Math.round(cheapest / 100);
    const symbol = currency === 'ILS' ? '₪' : currency;
    return { text: `${shekels} ${symbol}` };
  }
}
