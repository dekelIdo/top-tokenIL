import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CartFacade } from '../../state/cart.facade';

/**
 * Site header. Mobile-first: the nav collapses behind a toggle below 900px and
 * the cart stays reachable at every width.
 */
@Component({
  selector: 'tt-app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar">
      <div class="tt-container inner">
        <a class="brand" routerLink="/">
          <span class="mark" aria-hidden="true">TT</span>
          <span class="name">TOP TOKEN</span>
        </a>

        <button type="button"
                class="toggle"
                (click)="menuOpen.set(!menuOpen())"
                [attr.aria-expanded]="menuOpen()"
                aria-label="תפריט">☰</button>

        <nav class="nav" [class.open]="menuOpen()" (click)="menuOpen.set(false)">
          <a routerLink="/store" routerLinkActive="active">חנות</a>
          <a routerLink="/games" routerLinkActive="active">משחקים</a>
          <a routerLink="/deals" routerLinkActive="active">מבצעים</a>
          <a routerLink="/reviews" routerLinkActive="active">ביקורות</a>
          <a routerLink="/support" routerLinkActive="active">תמיכה</a>
        </nav>

        <div class="actions">
          <a class="icon-link" routerLink="/account" routerLinkActive="active" aria-label="האזור האישי">
            <span aria-hidden="true">👤</span>
          </a>
          <a class="icon-link cart" routerLink="/cart" [attr.aria-label]="'עגלה, ' + count() + ' פריטים'">
            <span aria-hidden="true">🛒</span>
            <span class="count" *ngIf="count() > 0">{{ count() }}</span>
          </a>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .bar {
      position: sticky;
      inset-block-start: 0;
      z-index: 40;
      background: color-mix(in srgb, var(--tt-bg) 88%, transparent);
      backdrop-filter: blur(12px);
      border-block-end: 1px solid var(--tt-border);
    }
    .inner {
      display: flex;
      align-items: center;
      gap: var(--tt-space-4);
      min-block-size: var(--tt-header-height);
    }
    .brand { display: flex; align-items: center; gap: var(--tt-space-2); color: var(--tt-text); font-weight: 800; }
    .brand:hover { text-decoration: none; }
    .mark {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-brand-500);
      color: var(--tt-text-on-brand);
      font-size: var(--tt-text-sm);
    }
    .name { letter-spacing: 0.06em; font-size: var(--tt-text-sm); }
    .nav { display: flex; gap: var(--tt-space-4); flex: 1; }
    .nav a { color: var(--tt-text-muted); font-weight: 600; font-size: var(--tt-text-sm); }
    .nav a:hover, .nav a.active { color: var(--tt-text); text-decoration: none; }
    .actions { display: flex; align-items: center; gap: var(--tt-space-2); margin-inline-start: auto; }
    .icon-link {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-2);
      border: 1px solid var(--tt-border);
      text-decoration: none;
    }
    .count {
      position: absolute;
      inset-block-start: -4px;
      inset-inline-end: -4px;
      min-inline-size: 18px;
      padding-inline: 4px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-brand-500);
      color: var(--tt-text-on-brand);
      font-size: 11px;
      font-weight: 700;
      text-align: center;
    }
    .toggle { display: none; background: none; border: 0; color: var(--tt-text); font-size: 1.4rem; cursor: pointer; }

    @media (max-width: 900px) {
      .toggle { display: block; margin-inline-start: auto; order: 3; }
      .actions { order: 2; margin-inline-start: 0; }
      .nav {
        order: 4;
        flex-basis: 100%;
        flex-direction: column;
        gap: var(--tt-space-3);
        display: none;
        padding-block: var(--tt-space-4);
        border-block-start: 1px solid var(--tt-border);
      }
      .nav.open { display: flex; }
      .inner { flex-wrap: wrap; }
    }
  `],
})
export class AppHeaderComponent {
  private readonly cart = inject(CartFacade);

  readonly menuOpen = signal(false);
  readonly count = this.cart.itemCount;
}
