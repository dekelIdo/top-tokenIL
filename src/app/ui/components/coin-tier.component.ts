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
          <stop offset="0" stop-color="#FFF3D2"/>
          <stop offset="0.34" stop-color="var(--tt-gold-400)"/>
          <stop offset="0.72" stop-color="var(--tt-gold-500)"/>
          <stop offset="1" stop-color="var(--tt-gold-600)"/>
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
          <!-- The rim, drawn facet by facet. A single dark shape under the face
               reads as a sticker with a shadow; eight quads each lit by their
               own angle read as a machined edge, which is the whole difference
               between a flat icon and something with a material. -->
          <polygon *ngFor="let facet of facets(token)"
                   [attr.points]="facet.points"
                   [attr.fill]="facet.fill"/>

          <!-- Struck face. -->
          <polygon [attr.points]="octagon(token, 0)"
                   [attr.fill]="'url(#' + faceId + ')'"/>

          <!-- A recessed field inside the rim. The step between the two is what
               gives the face somewhere for the mark to sit. -->
          <polygon [attr.points]="octagon(token, 0, 0.84)"
                   fill="#000000" fill-opacity="0.09"/>
          <polygon [attr.points]="octagon(token, -0.9, 0.84)"
                   [attr.fill]="'url(#' + faceId + ')'"/>

          <!-- Specular sweep along the upper edge. -->
          <polygon [attr.points]="octagon(token, 0, 0.98)"
                   [attr.fill]="'url(#' + sheenId + ')'"/>

          <!-- Rim light along the lower edge, where the ground bounces back.
               Without it the object floats instead of sitting somewhere. -->
          <polyline [attr.points]="lowerArc(token)"
                    fill="none" stroke="var(--tt-gold-300)" stroke-opacity="0.5"
                    [attr.stroke-width]="token.r > 30 ? 1.4 : 0.9"
                    stroke-linecap="round"/>

          <!-- The brand Z, struck into the face. Omitted on the small
               background tokens, where it would only be noise. -->
          <g *ngIf="token.face" [attr.transform]="faceTransform(token)">
            <path d="M15 14 H47 V21.5 L29 41 H47 V49.5 H15 V42 L33 22.5 H15 Z"
                  fill="#000000" fill-opacity="0.28" transform="translate(0,1.2)"/>
            <path d="M15 14 H47 V21.5 L29 41 H47 V49.5 H15 V42 L33 22.5 H15 Z"
                  fill="#8A5C12" fill-opacity="0.85"/>
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
    return [42, 54, 62, 72, 82][Math.min(4, this.count - 1)];
  }

  /**
   * The composition for this tier, painted back to front.
   *
   * Five arrangements, not one arrangement with pieces removed. The tiers used
   * to be a single cluster sliced by count, which meant a bigger bundle was
   * literally the smaller bundle with extra tokens switched on: the same
   * picture, so the eye read "more dots" rather than "more money".
   *
   * These differ by arrangement and by mass. The small tiers are loose objects
   * lying about. From the middle tier up they become stacks, because a stack is
   * what quantity actually looks like, and the top tiers add a second stack and
   * a wider spread so the frame fills out. A customer can tell 100K from 2M
   * with the labels covered, which is the whole job.
   *
   * Fixed positions rather than generated ones, so a given bundle always looks
   * identical. Artwork that shifts between renders reads as a fault.
   */
  get tokens(): readonly Token[] {
    const S = 0.58;

    const compositions: Token[][] = [
      // One token, sitting low with air around it. An entry bundle should look
      // like a small thing, not a small version of a big thing.
      [
        { cx: 100, cy: 92, r: 40, squash: S, depth: 12, dim: 1, face: true },
      ],

      // A pair, one leaning past the other. Still loose objects.
      [
        { cx: 62, cy: 100, r: 30, squash: S, depth: 10, dim: 0.9, face: true },
        { cx: 120, cy: 88, r: 42, squash: S, depth: 12, dim: 1, face: true },
      ],

      // The arrangement changes: a short stack, with one token fallen beside
      // it. This is the first tier that reads as an amount rather than a few
      // coins.
      [
        { cx: 158, cy: 104, r: 24, squash: S, depth: 8, dim: 0.82, face: false },
        { cx: 92, cy: 104, r: 42, squash: S, depth: 12, dim: 0.94, face: false },
        { cx: 92, cy: 88, r: 42, squash: S, depth: 12, dim: 0.97, face: false },
        { cx: 92, cy: 72, r: 42, squash: S, depth: 12, dim: 1, face: true },
      ],

      // Taller stack, plus loose tokens front and back. More mass, wider frame.
      [
        { cx: 44, cy: 58, r: 16, squash: S, depth: 5, dim: 0.6, face: false },
        { cx: 154, cy: 62, r: 20, squash: S, depth: 6, dim: 0.7, face: false },
        { cx: 46, cy: 106, r: 27, squash: S, depth: 9, dim: 0.88, face: false },
        { cx: 158, cy: 100, r: 25, squash: S, depth: 8, dim: 0.85, face: false },
        { cx: 100, cy: 108, r: 44, squash: S, depth: 12, dim: 0.92, face: false },
        { cx: 100, cy: 92, r: 44, squash: S, depth: 12, dim: 0.95, face: false },
        { cx: 100, cy: 76, r: 44, squash: S, depth: 12, dim: 0.98, face: false },
        { cx: 100, cy: 60, r: 44, squash: S, depth: 12, dim: 1, face: true },
      ],

      // Two stacks and a scatter. The frame is full; this is the largest thing
      // the shop sells and it should look like it.
      [
        { cx: 30, cy: 52, r: 13, squash: S, depth: 4, dim: 0.5, face: false },
        { cx: 172, cy: 56, r: 15, squash: S, depth: 5, dim: 0.58, face: false },
        { cx: 168, cy: 108, r: 22, squash: S, depth: 7, dim: 0.78, face: false },
        { cx: 46, cy: 100, r: 30, squash: S, depth: 10, dim: 0.82, face: false },
        { cx: 46, cy: 86, r: 30, squash: S, depth: 10, dim: 0.86, face: false },
        { cx: 46, cy: 72, r: 30, squash: S, depth: 10, dim: 0.9, face: true },
        { cx: 116, cy: 112, r: 44, squash: S, depth: 12, dim: 0.9, face: false },
        { cx: 116, cy: 96, r: 44, squash: S, depth: 12, dim: 0.93, face: false },
        { cx: 116, cy: 80, r: 44, squash: S, depth: 12, dim: 0.96, face: false },
        { cx: 116, cy: 64, r: 44, squash: S, depth: 12, dim: 1, face: true },
      ],
    ];

    return compositions[Math.min(compositions.length - 1, this.count - 1)];
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

  /**
   * The visible side facets, each shaded by which way it faces.
   *
   * Light is treated as coming from the upper left, so a facet turned toward it
   * is nearly the face colour and one turned away falls to the shadow tone.
   * Only the facets on the lower silhouette can be seen from this angle; the
   * ones behind the face are skipped rather than drawn and covered.
   */
  facets(token: Token): readonly { points: string; fill: string }[] {
    const out: { points: string; fill: string }[] = [];

    for (let index = 0; index < 8; index += 1) {
      const a0 = ((index * 45 + 22.5) * Math.PI) / 180;
      const a1 = (((index + 1) * 45 + 22.5) * Math.PI) / 180;

      // The direction this facet points, from the midpoint of its edge.
      const mid = (a0 + a1) / 2;
      const facingDown = Math.sin(mid);
      if (facingDown < -0.15) {
        continue;
      }

      const p = (angle: number, dy: number) => {
        const x = token.cx + Math.cos(angle) * token.r;
        const y = token.cy + Math.sin(angle) * token.r * token.squash + dy;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      };

      // Lambert-ish term against a light at the upper left.
      const lambert = (-Math.cos(mid) * 0.6 - Math.sin(mid) * 0.8 + 1) / 2;
      const shade = Math.max(0, Math.min(1, lambert));

      out.push({
        points: [p(a0, 0), p(a1, 0), p(a1, token.depth), p(a0, token.depth)].join(' '),
        fill: CoinTierComponent.mixGold(shade),
      });
    }

    return out;
  }

  /**
   * Blends between the shadow tone and the lit tone.
   *
   * Hard-coded hexes rather than theme variables: an SVG fill cannot interpolate
   * two custom properties, and these are the material's own shading, not part of
   * the palette a theme would restyle.
   */
  private static mixGold(t: number): string {
    const dark = [0x5C, 0x39, 0x0B];
    const light = [0xFF, 0xD3, 0x71];
    const channel = (index: number) =>
      Math.round(dark[index] + (light[index] - dark[index]) * t)
        .toString(16)
        .padStart(2, '0');
    return `#${channel(0)}${channel(1)}${channel(2)}`;
  }

  /** The lower silhouette, for the bounce light along the bottom edge. */
  lowerArc(token: Token): string {
    const points: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const angle = ((index * 45 + 22.5) * Math.PI) / 180;
      if (Math.sin(angle) < 0.3) {
        continue;
      }
      const x = token.cx + Math.cos(angle) * token.r;
      const y = token.cy + Math.sin(angle) * token.r * token.squash + token.depth;
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
