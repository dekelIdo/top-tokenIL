import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BRAND } from '../../core/brand';

/**
 * The ZuzCOINS lockup: mark plus wordmark.
 *
 * The name is read from the brand configuration rather than typed into the
 * template, so renaming the company does not mean editing the header.
 *
 * The wordmark weights its two halves differently: "Zuz" carries the identity
 * and is set solid, "COINS" is the category and steps back. That is what stops
 * it reading as an evenly-weighted word, which is what generic wordmarks do.
 */
@Component({
  selector: 'tt-brand-logo',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="lockup" [class.compact]="compact">
      <svg class="mark" [attr.width]="markSize" [attr.height]="markSize"
           viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="var(--tt-gold-400)"/>
            <stop offset="1" stop-color="var(--tt-gold-600)"/>
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="19" [attr.fill]="'url(#' + gradientId + ')'"/>
        <path d="M15 15h18L19 33h14" fill="none" stroke="#12101C"
              stroke-width="5" stroke-linecap="square"/>
      </svg>

      <span class="word" *ngIf="!compact">
        <span class="word__lead">{{ leadPart }}</span><span class="word__tail">{{ tailPart }}</span>
      </span>
    </span>
  `,
  styles: [`
    .lockup {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      color: var(--tt-text);
    }
    .mark { flex: none; display: block; }
    .word {
      font-family: var(--tt-font-display);
      font-size: var(--tt-text-lg);
      line-height: 1;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    /* The identity half is solid; the category half steps back a weight and a
       shade so the lockup has a hierarchy rather than one flat word. */
    .word__lead { font-weight: 800; }
    .word__tail { font-weight: 600; color: var(--tt-text-muted); }
  `],
})
export class BrandLogoComponent {
  /** Mark only, for tight spaces such as a mobile header or a drawer. */
  @Input() compact = false;
  @Input() markSize = 30;

  readonly leadPart = BRAND.nameParts[0];
  readonly tailPart = BRAND.nameParts[1];

  /** Unique per instance so two lockups on one page cannot share a gradient id. */
  readonly gradientId = `zc-mark-${Math.random().toString(36).slice(2, 9)}`;
}
