import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The ZuzCOINS currency object.
 *
 * This is the brand's product asset, and it has been through two wrong answers
 * already. A cartoon pile of coins was the generic thing every currency shop
 * draws and it turned to mush at card size. A stack of flat plates read as a
 * staircase and never said "money" at all.
 *
 * What is drawn now is a machined octagonal token: a chamfered rim, a face
 * carrying the brand Z, a specular sweep along the top edge, and real extruded
 * depth. The octagon is the point. A circle is a coin from any brand; eight
 * flat sides read as something struck to a specification, which is the register
 * this shop wants, and the shape holds a hard silhouette at forty pixels where
 * a circle collapses into a dot.
 *
 * Tokens are placed asymmetrically and at different sizes rather than stacked,
 * so the composition has a front and a back instead of a centre.
 *
 * Inline SVG on theme variables. No image files, nothing to download, and it
 * recolours with the theme.
 */
export type CoinTier = 'entry' | 'standard' | 'premium' | 'hero';

interface Token {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Vertical squash, giving the three-quarter view. */
  readonly squash: number;
  readonly depth: number;
  /** Tokens further back sit deeper into the dark. */
  readonly dim: number;
  /** The Z is only legible above a certain size. */
  readonly face: boolean;
}

@Component({
  selector: 'tt-coin-tier',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 200 150" class="art" [class]="'art--' + tier" aria-hidden="true">
      <defs>
        <!-- Metal, not yellow. The band runs light along the top edge, deepens
             through the middle and lifts again at the bottom, which is what
             separates a struck surface from a flat fill. -->
        <linearGradient [attr.id]="faceId" x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stop-color="var(--tt-gold-300)"/>
          <stop offset="0.42" stop-color="var(--tt-gold-500)"/>
          <stop offset="0.78" stop-color="var(--tt-gold-600)"/>
          <stop offset="1" stop-color="var(--tt-gold-400)"/>
        </linearGradient>

        <!-- The extruded side, always darker than the face above it. -->
        <linearGradient [attr.id]="edgeId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--tt-gold-600)"/>
          <stop offset="1" stop-color="#7A4E10"/>
        </linearGradient>

        <linearGradient [attr.id]="sheenId" x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
          <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.05"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>

        <radialGradient [attr.id]="glowId" cx="50%" cy="74%" r="55%">
          <stop offset="0" stop-color="var(--tt-gold-500)" stop-opacity="0.20"/>
          <stop offset="1" stop-color="var(--tt-gold-500)" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="122" [attr.rx]="glowWidth" ry="20"
               [attr.fill]="'url(#' + glowId + ')'"/>

      <g class="cluster">
        <g *ngFor="let token of tokens" [attr.opacity]="token.dim">
          <!-- Extruded side, drawn first and offset downward. -->
          <polygon [attr.points]="octagon(token, token.depth)"
                   [attr.fill]="'url(#' + edgeId + ')'"/>
          <!-- Struck face. -->
          <polygon [attr.points]="octagon(token, 0)"
                   [attr.fill]="'url(#' + faceId + ')'"/>
          <!-- Chamfer: an inset outline, which is what makes this read as a rim
               rather than as a flat gold shape. -->
          <polygon [attr.points]="octagon(token, 0, 0.82)"
                   fill="none" stroke="#7A4E10" stroke-opacity="0.34"
                   [attr.stroke-width]="token.r > 30 ? 1.6 : 1"/>
          <!-- Specular sweep along the upper edge of the face. -->
          <polygon [attr.points]="octagon(token, 0, 0.95)"
                   [attr.fill]="'url(#' + sheenId + ')'"/>

          <!-- The brand Z, struck into the face. Omitted on the small
               background tokens, where it would only be noise. -->
          <g *ngIf="token.face"
             [attr.transform]="faceTransform(token)"
             fill="#5A390A" fill-opacity="0.66">
            <path d="M15 14 H47 V21.5 L29 41 H47 V49.5 H15 V42 L33 22.5 H15 Z"/>
          </g>
        </g>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; inline-size: 100%; }
    .art { inline-size: 100%; block-size: auto; display: block; }

    /* The largest composition drifts, which reads as weight rather than as an
       animation. Nothing spins: a spinning coin is a casino, not a shop. */
    .art--hero .cluster { animation: tt-token-drift 7s var(--tt-ease) infinite alternate; }
    @keyframes tt-token-drift {
      from { transform: translateY(0); }
      to { transform: translateY(-3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .art--hero .cluster { animation: none; }
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
   * An explicit token count, overriding the tier.
   *
   * The price ladder uses this. Its bundles can fall inside the same quantity
   * band, and two tiers side by side with identical artwork tells a customer
   * the wrong thing. Given a rank the ladder gets visibly distinct objects,
   * which is a truthful depiction of the order it already sorted them into.
   */
  @Input() steps?: number;

  /** Unique per instance so two illustrations cannot share a gradient id. */
  private readonly uid = Math.random().toString(36).slice(2, 8);
  readonly faceId = `zc-face-${this.uid}`;
  readonly edgeId = `zc-edge-${this.uid}`;
  readonly sheenId = `zc-sheen-${this.uid}`;
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

  private get count(): number {
    if (this.steps !== undefined) {
      return Math.min(5, Math.max(1, Math.round(this.steps)));
    }
    return { entry: 1, standard: 2, premium: 3, hero: 4 }[this.tier];
  }

  get glowWidth(): number {
    return 34 + this.count * 10;
  }

  /**
   * The cluster, painted back to front.
   *
   * Fixed positions rather than generated ones, so a given bundle always looks
   * identical. Artwork that shifts between renders reads as a fault.
   */
  get tokens(): readonly Token[] {
    const all: Token[] = [
      { cx: 100, cy: 82, r: 46, squash: 0.58, depth: 13, dim: 1, face: true },
      { cx: 45, cy: 103, r: 29, squash: 0.58, depth: 9, dim: 0.92, face: true },
      { cx: 157, cy: 97, r: 25, squash: 0.58, depth: 8, dim: 0.8, face: false },
      { cx: 134, cy: 42, r: 19, squash: 0.58, depth: 6, dim: 0.62, face: false },
      { cx: 62, cy: 38, r: 15, squash: 0.58, depth: 5, dim: 0.5, face: false },
    ];

    // Reversed so the smallest background tokens paint first and the largest
    // lands on top of the cluster.
    return all.slice(0, this.count).slice().reverse();
  }

  /**
   * An octagon in three-quarter view.
   *
   * Vertices are offset by half a step so the shape has flat top, bottom and
   * side edges. A vertex-up octagon reads as a gemstone; a flat-edged one reads
   * as something struck in a press.
   */
  octagon(token: Token, dy: number, scale = 1): string {
    const points: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const angle = ((index * 45 + 22.5) * Math.PI) / 180;
      const x = token.cx + Math.cos(angle) * token.r * scale;
      const y = token.cy + Math.sin(angle) * token.r * token.squash * scale + dy;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    return points.join(' ');
  }

  /** Places the 64-unit brand Z inside a token's face. */
  faceTransform(token: Token): string {
    const size = (token.r * 1.02) / 64;
    const heightScale = size * token.squash * 1.55;
    const offsetX = token.cx - 32 * size;
    const offsetY = token.cy - 32 * heightScale;
    return `translate(${offsetX.toFixed(1)},${offsetY.toFixed(1)}) `
      + `scale(${size.toFixed(3)},${heightScale.toFixed(3)}) skewX(-9)`;
  }
}
