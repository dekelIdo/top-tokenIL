import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Coin-bundle artwork, drawn from the quantity.
 *
 * The catalog previously used one illustration for every coin product, so a
 * 100K bundle and a 2M bundle were the same picture with a different number
 * under it. Quantity is the thing a buyer is choosing between, and it was
 * carrying no visual weight at all.
 *
 * This renders the tier instead: how many discs, how they stack, how dense the
 * field behind them, and how much light is on them. A larger bundle is visibly
 * a larger bundle before the label is read.
 *
 * Pure inline SVG driven by CSS variables. No image files, no 3D, nothing to
 * download, and it recolours with the theme. Four tiers rather than a smooth
 * function, because a customer is choosing between discrete packages and the
 * steps should be legible.
 */
export type CoinTier = 'entry' | 'standard' | 'premium' | 'hero';

@Component({
  selector: 'tt-coin-tier',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 200 150'" class="art" [class]="'art--' + tier" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="faceId" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="var(--tt-gold-300)"/>
          <stop offset="0.55" stop-color="var(--tt-gold-500)"/>
          <stop offset="1" stop-color="var(--tt-gold-600)"/>
        </linearGradient>
        <radialGradient [attr.id]="glowId" cx="50%" cy="62%" r="55%">
          <stop offset="0" stop-color="var(--tt-gold-500)" stop-opacity="0.30"/>
          <stop offset="1" stop-color="var(--tt-gold-500)" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Light pooling under the stack. Stronger on the bigger tiers, which is
           most of what makes them feel weightier. -->
      <ellipse cx="100" cy="104" [attr.rx]="glowWidth" ry="34" [attr.fill]="'url(#' + glowId + ')'"/>

      <!-- Scattered discs behind the stack. Their count is the tier. -->
      <g class="scatter">
        <ellipse *ngFor="let disc of scatter"
                 [attr.cx]="disc.x" [attr.cy]="disc.y"
                 [attr.rx]="disc.r" [attr.ry]="disc.r * 0.42"
                 [attr.fill]="'url(#' + faceId + ')'"
                 [attr.opacity]="disc.opacity"/>
      </g>

      <!-- The stack. Drawn bottom up so each disc overlaps the one below. -->
      <g class="stack">
        <g *ngFor="let disc of stack; let i = index">
          <ellipse [attr.cx]="100" [attr.cy]="disc.y" rx="42" ry="17"
                   [attr.fill]="'url(#' + faceId + ')'"/>
          <rect x="58" [attr.y]="disc.y - 8" width="84" height="8"
                [attr.fill]="'url(#' + faceId + ')'" opacity="0.85"/>
        </g>
        <!-- Top face, lit. -->
        <ellipse cx="100" [attr.cy]="topY" rx="42" ry="17" [attr.fill]="'url(#' + faceId + ')'"/>
        <ellipse cx="100" [attr.cy]="topY - 2" rx="27" ry="10" fill="#FFF6DC" opacity="0.5"/>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; inline-size: 100%; }
    .art { inline-size: 100%; block-size: auto; display: block; }

    /* The hero tier gets a slow drift, which reads as weight rather than as an
       animation. Everything else is still. */
    .art--hero .stack { animation: tt-coin-drift 5s var(--tt-ease) infinite alternate; }
    @keyframes tt-coin-drift {
      from { transform: translateY(0); }
      to { transform: translateY(-2.5px); }
    }
  `],
})
export class CoinTierComponent {
  /** Set from the bundle's quantity; the component never guesses. */
  @Input() set quantity(value: number | undefined) {
    this.tier = CoinTierComponent.tierFor(value);
  }

  @Input() tier: CoinTier = 'standard';

  /** Unique per instance so two illustrations cannot share a gradient id. */
  private readonly uid = Math.random().toString(36).slice(2, 8);
  readonly faceId = `zc-face-${this.uid}`;
  readonly glowId = `zc-glow-${this.uid}`;

  /**
   * Where the tier boundaries sit.
   *
   * Chosen to match how bundles are actually sold rather than a smooth curve:
   * up to a quarter million is entry, up to a million is standard, up to two is
   * premium, above that is the hero package.
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
    return { entry: 2, standard: 4, premium: 6, hero: 8 }[this.tier];
  }

  get glowWidth(): number {
    return { entry: 46, standard: 56, premium: 66, hero: 76 }[this.tier];
  }

  /** Stack discs, bottom to top. More coins means a taller stack. */
  get stack(): { y: number }[] {
    const base = 96;
    return Array.from({ length: this.depth }, (_, index) => ({ y: base - index * 9 }));
  }

  get topY(): number {
    return 96 - this.depth * 9;
  }

  /**
   * Loose discs around the stack.
   *
   * Fixed positions rather than random ones, so the same bundle always looks
   * the same. A picture that changes on every render reads as a glitch.
   */
  get scatter(): { x: number; y: number; r: number; opacity: number }[] {
    const all = [
      { x: 44, y: 100, r: 17, opacity: 0.9 },
      { x: 158, y: 96, r: 15, opacity: 0.85 },
      { x: 32, y: 78, r: 12, opacity: 0.6 },
      { x: 170, y: 74, r: 13, opacity: 0.65 },
      { x: 62, y: 62, r: 9, opacity: 0.45 },
      { x: 140, y: 56, r: 10, opacity: 0.5 },
    ];
    return all.slice(0, { entry: 0, standard: 2, premium: 4, hero: 6 }[this.tier]);
  }
}
