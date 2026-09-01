import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Bundle artwork, drawn from the quantity.
 *
 * The catalog used to show a cartoon pile of coins, the same picture on every
 * product with a different number underneath. It had two problems. A pile is
 * unreadable at card size, and a drawn coin is the single most generic thing a
 * currency shop can put on a page.
 *
 * This draws the bundle as a stack of sheared plates instead: tokens seen edge
 * on, cut at the same nine degrees as the brand mark. Depth is the tier, so a
 * larger bundle is visibly a larger bundle, and the whole catalogue reads as
 * one family rather than one clipart.
 *
 * Inline SVG driven by theme variables. No image files, nothing to download,
 * and it recolours with the theme. Four tiers rather than a smooth function,
 * because a customer is choosing between discrete packages and the steps have
 * to be legible.
 */
export type CoinTier = 'entry' | 'standard' | 'premium' | 'hero';

interface Plate {
  readonly y: number;
  readonly width: number;
  readonly opacity: number;
}

@Component({
  selector: 'tt-coin-tier',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 200 150" class="art" [class]="'art--' + tier" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="faceId" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="var(--tt-gold-300)"/>
          <stop offset="0.5" stop-color="var(--tt-gold-500)"/>
          <stop offset="1" stop-color="var(--tt-gold-600)"/>
        </linearGradient>
        <radialGradient [attr.id]="glowId" cx="50%" cy="70%" r="52%">
          <stop offset="0" stop-color="var(--tt-gold-500)" stop-opacity="0.26"/>
          <stop offset="1" stop-color="var(--tt-gold-500)" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Light pooling under the stack. Wider on the bigger tiers, which is
           most of what gives them weight. -->
      <ellipse cx="100" cy="120" [attr.rx]="glowWidth" ry="26"
               [attr.fill]="'url(#' + glowId + ')'"/>

      <!-- The stack, bottom plate first. The shear matches the brand mark, so
           the product art and the logo are cut from the same angle. -->
      <g class="stack" transform="skewX(-9) translate(9,0)">
        <g *ngFor="let plate of plates" [attr.opacity]="plate.opacity">
          <rect [attr.x]="100 - plate.width / 2" [attr.y]="plate.y"
                [attr.width]="plate.width" height="15" rx="7.5"
                [attr.fill]="'url(#' + faceId + ')'"/>
          <!-- A lit top edge. Without it the plates read as flat bars. -->
          <rect [attr.x]="100 - plate.width / 2 + 8" [attr.y]="plate.y + 2.5"
                [attr.width]="plate.width - 16" height="2.5" rx="1.25"
                fill="#FFF6DC" opacity="0.42"/>
        </g>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; inline-size: 100%; }
    .art { inline-size: 100%; block-size: auto; display: block; }

    /* The largest tier drifts, which reads as weight rather than as animation.
       Everything else is still. */
    .art--hero .stack { animation: tt-plate-drift 6s var(--tt-ease) infinite alternate; }
    @keyframes tt-plate-drift {
      from { transform: skewX(-9deg) translate(9px, 0); }
      to { transform: skewX(-9deg) translate(9px, -3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .art--hero .stack { animation: none; }
    }
  `],
})
export class CoinTierComponent {
  /** Set from the bundle's quantity; the component never guesses. */
  @Input() set quantity(value: number | undefined) {
    this.tier = CoinTierComponent.tierFor(value);
  }

  @Input() tier: CoinTier = 'standard';

  /**
   * An explicit plate count, overriding the tier.
   *
   * The price ladder uses this. Its five bundles can fall inside the same
   * quantity band, and two tiers sitting side by side with identical artwork
   * tells a customer the wrong thing. Given a rank the ladder gets five
   * visibly distinct stacks, which is a truthful depiction of the order it
   * already sorted them into.
   */
  @Input() steps?: number;

  /** Unique per instance so two illustrations cannot share a gradient id. */
  private readonly uid = Math.random().toString(36).slice(2, 8);
  readonly faceId = `zc-face-${this.uid}`;
  readonly glowId = `zc-glow-${this.uid}`;

  /**
   * Where the tier boundaries sit.
   *
   * Chosen to match how bundles are actually sold rather than a smooth curve:
   * up to a quarter million is entry, up to a million is standard, up to two is
   * premium, above that is the largest package.
   */
  static tierFor(quantity: number | undefined): CoinTier {
    if (!quantity) {
      return 'standard';
    }
    if (quantity <= 250_000) {
      return 'entry';
    }
    if (quantity <= 1_000_000) {
      return 'standard';
    }
    return quantity <= 2_000_000 ? 'premium' : 'hero';
  }

  private get depth(): number {
    if (this.steps !== undefined) {
      return Math.min(6, Math.max(1, Math.round(this.steps)));
    }
    return { entry: 2, standard: 3, premium: 4, hero: 5 }[this.tier];
  }

  get glowWidth(): number {
    return { entry: 44, standard: 54, premium: 64, hero: 74 }[this.tier];
  }

  /**
   * The plates, bottom to top.
   *
   * Each one above the last is a little narrower and a little brighter, so the
   * stack has perspective and a clear top rather than reading as a flat ladder.
   */
  get plates(): readonly Plate[] {
    const count = this.depth;
    const base = 112;

    return Array.from({ length: count }, (_, index) => ({
      y: base - index * 21,
      width: 112 - index * 7,
      opacity: 0.62 + (index / Math.max(1, count - 1)) * 0.38,
    }));
  }
}
