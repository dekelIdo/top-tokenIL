import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A EASYCOINS pack.
 *
 * The catalogue kept reading as "a website that sells a number" because the
 * artwork was only ever coins. Coins say money; they do not say Ultimate Team.
 * What players recognise from that world is the pack: a tall card with a metal
 * frame, lit from behind, with something valuable inside it.
 *
 * So this draws a pack. The silhouette is deliberately our own: a portrait card
 * with the top trailing corner cut on the brand's nine degrees, a double gold
 * rule inset from the edge, a struck Z medallion where a pack would show its
 * contents, and a denomination plate along the bottom. It is not an EA card and
 * does not borrow one: no rating corner, no player frame, no stat grid, no
 * publisher mark. The cue is the format and the material, which is the part
 * that is nobody's property.
 *
 * Coins spill from the base so the pack still says currency, and the count and
 * the lighting climb with the tier, so a bigger bundle is a visibly bigger
 * object before a label is read.
 *
 * Inline SVG on theme variables. Nothing to download, and it recolours with the
 * theme.
 */
@Component({
  selector: 'tt-coin-pack',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 200 250" class="pack" [class.pack--top]="steps >= 4" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="id('body')" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stop-color="#241F17"/>
          <stop offset="0.45" stop-color="#14110D"/>
          <stop offset="1" stop-color="#0B0907"/>
        </linearGradient>

        <linearGradient [attr.id]="id('trim')" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#FFF3D2"/>
          <stop offset="0.35" stop-color="var(--tt-gold-400)"/>
          <stop offset="0.7" stop-color="var(--tt-gold-600)"/>
          <stop offset="1" stop-color="#FFE6AE"/>
        </linearGradient>

        <linearGradient [attr.id]="id('metal')" x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stop-color="#FFF3D2"/>
          <stop offset="0.34" stop-color="var(--tt-gold-400)"/>
          <stop offset="0.72" stop-color="var(--tt-gold-500)"/>
          <stop offset="1" stop-color="var(--tt-gold-600)"/>
        </linearGradient>

        <linearGradient [attr.id]="id('edge')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--tt-gold-600)"/>
          <stop offset="1" stop-color="#7A4E10"/>
        </linearGradient>

        <!-- The light behind the pack. Cool, so the gold in front separates. -->
        <radialGradient [attr.id]="id('stage')" cx="50%" cy="34%" r="62%">
          <stop offset="0" stop-color="var(--tt-brand-400)" stop-opacity="0.34"/>
          <stop offset="0.55" stop-color="var(--tt-brand-700)" stop-opacity="0.14"/>
          <stop offset="1" stop-color="var(--tt-brand-700)" stop-opacity="0"/>
        </radialGradient>

        <radialGradient [attr.id]="id('pool')" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="var(--tt-gold-500)" stop-opacity="0.30"/>
          <stop offset="1" stop-color="var(--tt-gold-500)" stop-opacity="0"/>
        </radialGradient>

        <linearGradient [attr.id]="id('sheen')" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
          <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.03"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Stadium wash behind everything. -->
      <ellipse cx="100" cy="96" rx="96" ry="104" [attr.fill]="'url(#' + id('stage') + ')'"/>

      <!-- A second pack behind, on the larger tiers only, so the top of the
           range reads as a haul rather than as one item. -->
      <g *ngIf="steps >= 4" class="pack__behind" transform="rotate(-6 100 115) translate(-18,-6) scale(0.94)">
        <path [attr.d]="cardPath" fill="#100D0A" stroke="var(--tt-gold-600)"
              stroke-opacity="0.5" stroke-width="2"/>
      </g>

      <g class="pack__card">
        <path [attr.d]="cardPath" [attr.fill]="'url(#' + id('body') + ')'"/>
        <!-- Double rule: the outer frame and a hairline inset from it. Two
             lines at different weights is what reads as milled metal. -->
        <path [attr.d]="cardPath" fill="none" [attr.stroke]="'url(#' + id('trim') + ')'" stroke-width="3"/>
        <path [attr.d]="innerPath" fill="none" stroke="var(--tt-gold-500)"
              stroke-opacity="0.42" stroke-width="1"/>
        <path [attr.d]="cardPath" [attr.fill]="'url(#' + id('sheen') + ')'"/>

        <!-- Contents: a struck medallion where a pack shows what is inside. -->
        <g [attr.transform]="'translate(100,' + medallionY + ')'">
          <ellipse cx="0" cy="6" rx="54" ry="34" [attr.fill]="'url(#' + id('pool') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42, 0.82, 10)" [attr.fill]="'url(#' + id('edge') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42, 0.82)" [attr.fill]="'url(#' + id('metal') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42 * 0.82, 0.82)" fill="none"
                   stroke="#7A4E10" stroke-opacity="0.34" stroke-width="1.6"/>
          <g transform="translate(-21,-14) scale(0.66,0.55) skewX(-9)" fill="#5A390A" fill-opacity="0.7">
            <path d="M14 12h10v40H14ZM14 12h34v10H14ZM14 27h26v10H14ZM14 42h34v10H14Z"/>
          </g>
        </g>

        <!-- Denomination plate. Blank of any figure: the quantity is set in real
             type beside the artwork, never baked into a picture. -->
        <g [attr.transform]="'translate(100,' + plateY + ')'">
          <rect x="-58" y="-10" width="116" height="20" rx="4"
                [attr.fill]="'url(#' + id('trim') + ')'" opacity="0.92"/>
          <rect x="-49" y="-5" width="98" height="3.4" rx="1.7" fill="#5A390A" opacity="0.32"/>
          <rect x="-49" y="2" width="64" height="3.4" rx="1.7" fill="#5A390A" opacity="0.22"/>
        </g>
      </g>

      <!-- Coins spilling at the base. Count climbs with the tier. -->
      <g class="pack__spill">
        <g *ngFor="let coin of spill">
          <polygon [attr.points]="octagon(coin.x, coin.y, coin.r, 0.58, coin.d)"
                   [attr.fill]="'url(#' + id('edge') + ')'" [attr.opacity]="coin.dim"/>
          <polygon [attr.points]="octagon(coin.x, coin.y, coin.r, 0.58)"
                   [attr.fill]="'url(#' + id('metal') + ')'" [attr.opacity]="coin.dim"/>
        </g>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; inline-size: 100%; }
    .pack { inline-size: 100%; block-size: auto; display: block; }

    /* Only the largest composition moves, and only barely. */
    .pack--top .pack__card { animation: tt-pack-float 7s var(--tt-ease) infinite alternate; }
    @keyframes tt-pack-float {
      from { transform: translateY(0); }
      to { transform: translateY(-3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .pack--top .pack__card { animation: none; }
    }
  `],
})
export class CoinPackComponent {
  /**
   * Which tier, one through five.
   *
   * Drives the coin count, the second pack behind, and the lighting. The pack
   * itself never changes shape: it is the product's constant, and the haul
   * around it is what grows.
   */
  @Input() steps = 3;

  private readonly uid = Math.random().toString(36).slice(2, 8);

  id(part: string): string {
    return `ep-${part}-${this.uid}`;
  }

  /**
   * Card outline.
   *
   * A clean portrait rectangle. The first version cut the top trailing corner
   * on the brand shear, and at card size that read as a dog-eared sheet of
   * paper rather than as anything premium. The pack character comes from the
   * milled double frame, the struck medallion and the light behind it, none of
   * which need the silhouette to be clever.
   */
  readonly cardPath = 'M38 22 H162 A9 9 0 0 1 171 31 V199 A9 9 0 0 1 162 208 '
    + 'H38 A9 9 0 0 1 29 199 V31 A9 9 0 0 1 38 22 Z';

  /** The hairline, inset from the frame. */
  readonly innerPath = 'M44 30 H156 A4 4 0 0 1 160 34 V196 A4 4 0 0 1 156 200 '
    + 'H44 A4 4 0 0 1 40 196 V34 A4 4 0 0 1 44 30 Z';

  get medallionY(): number {
    return 92;
  }

  get plateY(): number {
    return 172;
  }

  /**
   * The coins at the base.
   *
   * Fixed positions rather than generated ones, so a given tier always looks
   * identical. Artwork that shifts between renders reads as a fault.
   */
  get spill(): readonly { x: number; y: number; r: number; d: number; dim: number }[] {
    const all = [
      { x: 62, y: 206, r: 20, d: 7, dim: 1 },
      { x: 138, y: 204, r: 17, d: 6, dim: 0.94 },
      { x: 100, y: 218, r: 22, d: 8, dim: 1 },
      { x: 34, y: 216, r: 14, d: 5, dim: 0.86 },
      { x: 166, y: 216, r: 13, d: 5, dim: 0.8 },
      { x: 82, y: 232, r: 12, d: 4, dim: 0.72 },
    ];

    const counts = [1, 2, 3, 5, 6];
    return all.slice(0, counts[Math.min(4, Math.max(0, this.steps - 1))]);
  }

  /** An octagon in three-quarter view, matching the coin artwork's geometry. */
  octagon(cx: number, cy: number, r: number, squash: number, dy = 0): string {
    const points: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const angle = ((index * 45 + 22.5) * Math.PI) / 180;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * squash + dy;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    return points.join(' ');
  }
}
