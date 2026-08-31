import {
  ChangeDetectionStrategy, Component, HostListener, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { CartFacade } from '../../state/cart.facade';
import { BrandLogoComponent } from './brand-logo.component';
import { IconComponent } from './icon.component';

/**
 * The site header.
 *
 * Desktop and mobile are two different pieces of furniture rather than one
 * layout squeezed. On desktop the search sits in the middle and navigation runs
 * beside the brand; on mobile the bar keeps brand, search and cart within thumb
 * reach and everything else moves into a drawer with full-width rows.
 *
 * The bar changes on scroll: transparent over the hero, then a solid ground with
 * a hairline once the page moves. One small piece of state, and it is what stops
 * the header feeling glued on top of the page.
 */
@Component({
  selector: 'tt-app-header',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, RouterLinkActive,
    BrandLogoComponent, IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar" [class.bar--scrolled]="scrolled()">
      <div class="tt-container inner">
        <a class="brand" routerLink="/" aria-label="ZuzCOINS, לדף הבית">
          <tt-brand-logo></tt-brand-logo>
        </a>

        <nav class="nav" aria-label="ראשי">
          <a routerLink="/store" routerLinkActive="active">חנות</a>
          <a routerLink="/games" routerLinkActive="active">משחקים</a>
          <a routerLink="/deals" routerLinkActive="active">מבצעים</a>
          <a routerLink="/support" routerLinkActive="active">תמיכה</a>
        </nav>

        <form class="search" role="search" (ngSubmit)="submitSearch()">
          <tt-icon name="search" [size]="18" class="search__icon"></tt-icon>
          <input type="search"
                 name="q"
                 [(ngModel)]="query"
                 placeholder="חיפוש מוצר או משחק"
                 aria-label="חיפוש בחנות" />
        </form>

        <div class="actions">
          <a class="action" routerLink="/account" routerLinkActive="active" aria-label="האזור האישי">
            <tt-icon name="user"></tt-icon>
          </a>

          <a class="action action--cart"
             routerLink="/cart"
             [attr.aria-label]="'עגלת קניות, ' + count() + ' פריטים'">
            <tt-icon name="cart"></tt-icon>
            <span class="count" *ngIf="count() > 0" aria-hidden="true">{{ count() }}</span>
          </a>

          <button type="button"
                  class="action toggle"
                  (click)="menuOpen.set(!menuOpen())"
                  [attr.aria-expanded]="menuOpen()"
                  aria-controls="tt-mobile-nav"
                  aria-label="תפריט">
            <tt-icon [name]="menuOpen() ? 'close' : 'menu'"></tt-icon>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile navigation: full-width rows with generous targets, rather than
         the desktop links reflowed into a narrow column. It carries only what
         the bar cannot show; account and cart stay in the bar at every width,
         so repeating them here would be two controls for one destination. -->
    <div class="scrim" *ngIf="menuOpen()" (click)="menuOpen.set(false)"></div>

    <nav id="tt-mobile-nav"
         class="drawer"
         [class.open]="menuOpen()"
         aria-label="ניווט נייד"
         (click)="menuOpen.set(false)">
      <a routerLink="/store" routerLinkActive="active">
        <tt-icon name="tag" [size]="18"></tt-icon> חנות
      </a>
      <a routerLink="/games" routerLinkActive="active">
        <tt-icon name="gamepad" [size]="18"></tt-icon> משחקים
      </a>
      <a routerLink="/deals" routerLinkActive="active">
        <tt-icon name="bolt" [size]="18"></tt-icon> מבצעים
      </a>
      <a routerLink="/support" routerLinkActive="active">
        <tt-icon name="shield" [size]="18"></tt-icon> תמיכה
      </a>
    </nav>
  `,
  styles: [`
    .bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--tt-z-header);
      background: transparent;
      border-block-end: 1px solid transparent;
      transition: background-color var(--tt-duration) var(--tt-ease),
                  border-color var(--tt-duration) var(--tt-ease);
    }
    /* Only once the page has moved. Over the hero the bar stays out of the way. */
    .bar--scrolled {
      background: color-mix(in srgb, var(--tt-bg) 86%, transparent);
      backdrop-filter: blur(14px);
      border-block-end-color: var(--tt-border);
    }

    .inner {
      display: flex;
      align-items: center;
      gap: var(--tt-space-5);
      min-block-size: var(--tt-header-height);
    }

    .brand:hover { text-decoration: none; }

    .nav { display: flex; gap: var(--tt-space-5); }
    .nav a {
      position: relative;
      color: var(--tt-text-muted);
      font-weight: 600;
      font-size: var(--tt-text-sm);
      padding-block: var(--tt-space-2);
    }
    .nav a:hover { color: var(--tt-text); text-decoration: none; }
    .nav a.active { color: var(--tt-text); }
    /* Marks the active item without shifting the row. */
    .nav a.active::after {
      content: '';
      position: absolute;
      inset-inline: 0;
      inset-block-end: 0;
      block-size: 2px;
      border-radius: 2px;
      background: var(--tt-brand-500);
    }

    .search {
      position: relative;
      flex: 1;
      max-inline-size: 420px;
      margin-inline-start: auto;
    }
    .search__icon {
      position: absolute;
      inset-inline-start: var(--tt-space-3);
      inset-block-start: 50%;
      transform: translateY(-50%);
      color: var(--tt-text-faint);
      pointer-events: none;
    }
    .search input {
      inline-size: 100%;
      padding: 0.55rem var(--tt-space-3);
      padding-inline-start: 2.4rem;
      border-radius: var(--tt-radius-pill);
      border: 1px solid var(--tt-border);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .search input::placeholder { color: var(--tt-text-faint); }
    .search input:focus {
      outline: none;
      border-color: var(--tt-border-brand);
      background: var(--tt-surface-2);
    }

    .actions { display: flex; align-items: center; gap: var(--tt-space-2); }

    .action {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 42px;
      block-size: 42px;
      border-radius: var(--tt-radius-md);
      background: transparent;
      border: 1px solid transparent;
      color: var(--tt-text-muted);
      cursor: pointer;
      transition: color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .action:hover, .action.active {
      color: var(--tt-text);
      background: var(--tt-surface-2);
      text-decoration: none;
    }

    .count {
      position: absolute;
      inset-block-start: 3px;
      inset-inline-end: 3px;
      min-inline-size: 17px;
      padding-inline: 4px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 11px;
      font-weight: 800;
      line-height: 17px;
      text-align: center;
    }

    .toggle { display: none; }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: var(--tt-z-drawer);
      background: var(--tt-overlay);
      backdrop-filter: blur(2px);
    }

    .drawer {
      position: fixed;
      inset-block-start: var(--tt-header-height);
      inset-inline: 0;
      z-index: calc(var(--tt-z-drawer) + 1);
      display: none;
      flex-direction: column;
      padding: var(--tt-space-3);
      gap: var(--tt-space-1);
      background: var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      box-shadow: var(--tt-shadow-3);
    }
    .drawer.open { display: flex; }
    .drawer a {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      /* 52px: a comfortable thumb target, not a desktop link. */
      min-block-size: 52px;
      padding-inline: var(--tt-space-3);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text);
      font-weight: 600;
    }
    .drawer a:hover, .drawer a.active {
      background: var(--tt-surface-2);
      text-decoration: none;
    }
    .drawer a.active { color: var(--tt-brand-300); }

    /* Below the desktop breakpoint the middle of the bar goes to search and the
       navigation moves into the drawer. */
    @media (max-width: 1000px) {
      .nav { display: none; }
      .toggle { display: grid; }
      .inner { gap: var(--tt-space-3); }
      .search { max-inline-size: none; }
    }

    /* On the narrowest phones the search input costs more room than it earns, so
       it moves to the store page and the bar keeps brand and actions. */
    @media (max-width: 560px) {
      .search { display: none; }
      .actions { margin-inline-start: auto; }
    }
  `],
})
export class AppHeaderComponent {
  private readonly cart = inject(CartFacade);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly count = this.cart.itemCount;

  query = '';

  @HostListener('window:scroll')
  onScroll(): void {
    // A small threshold rather than zero, so a one-pixel trackpad bounce does
    // not flicker the bar.
    this.scrolled.set(window.scrollY > 8);
  }

  submitSearch(): void {
    const term = this.query.trim();
    // An empty search goes to the store rather than nowhere, which is what
    // pressing enter on a blank field is asking for.
    void this.router.navigate(['/store'], term ? { queryParams: { search: term } } : {});
  }
}
