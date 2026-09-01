import {
  ChangeDetectionStrategy, Component, HostListener, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { BehaviorSubject, Observable, of } from 'rxjs';
import {
  catchError, filter, map, shareReplay, startWith, switchMap, take,
} from 'rxjs/operators';

import { STOREFRONT } from '../../core/brand';
import { formatQuantity, rankByValue } from '../../core/value';
import { ProductDetail, ProductType } from '../../domain';
import { CartFacade } from '../../state/cart.facade';
import { CatalogFacade } from '../../state/catalog.facade';
import { CoinTierComponent } from './coin-tier.component';
import { BrandLogoComponent } from './brand-logo.component';
import { IconComponent, IconName } from './icon.component';
import { SearchBoxComponent } from './search-box.component';

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
interface MenuItem {
  readonly route: string;
  readonly icon: IconName;
  readonly label: string;
}

/** What the drawer offers, resolved from the catalog. */
interface FeaturedOffer {
  readonly slug: string;
  readonly variantId: string;
  readonly quantity: string;
  readonly price: string;
}

@Component({
  selector: 'tt-app-header',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive,
    BrandLogoComponent, IconComponent, SearchBoxComponent, CoinTierComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar" [class.bar--scrolled]="scrolled()">
      <div class="tt-container inner">
        <a class="brand" routerLink="/" aria-label="EASYCOINS, לדף הבית">
          <tt-brand-logo></tt-brand-logo>
        </a>

        <nav class="nav" aria-label="ראשי">
          <a routerLink="/store" routerLinkActive="active">חנות הקוינס</a>
          <a routerLink="/deals" routerLinkActive="active">מבצעים</a>
          <a routerLink="/delivery" routerLinkActive="active">איך זה עובד</a>
          <a routerLink="/support" routerLinkActive="active">תמיכה</a>
        </nav>

        <tt-search-box class="search"></tt-search-box>

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

          <!-- The one gold thing in the bar. A shop's header should say where
               to buy, and nothing else here competes for that. -->
          <a class="tt-btn tt-btn--buy buy-cta" routerLink="/store">קניית קוינס</a>

          <button type="button"
                  class="action toggle"
                  (click)="toggleMenu()"
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
    <div class="scrim" *ngIf="isMobile() && menuOpen()" (click)="closeMenu()"></div>

    <!--
      The mobile drawer.

      It used to be three links on a flat panel, which is why it read as
      unfinished: a customer opening it found less than the page they were
      already on. A drawer on a phone is the whole site's navigation, so it
      carries the whole site: what to buy, where the order is, who they are,
      and how to get help.

      It also merchandises. The best-value tier sits in it with real artwork and
      a real price, because a menu on a shop is a place someone is deciding
      what to do next, and offering them the thing they came for is better than
      offering them a list.
    -->
    <nav id="tt-mobile-nav"
         *ngIf="isMobile()"
         class="drawer"
         [class.open]="menuOpen()"
         [attr.inert]="menuOpen() ? null : ''"
         [attr.aria-hidden]="menuOpen() ? null : 'true'"
         aria-label="ניווט נייד">
      <div class="drawer__head">
        <tt-brand-logo [markSize]="26"></tt-brand-logo>
        <button type="button" class="drawer__close" (click)="closeMenu()" aria-label="סגירת התפריט">
          <tt-icon name="close" [size]="18"></tt-icon>
        </button>
      </div>

      <div class="drawer__scroll">
        <ul class="drawer__nav">
          <li *ngFor="let item of menu">
            <a [routerLink]="item.route" routerLinkActive="active" (click)="closeMenu()">
              <span class="drawer__glyph"><tt-icon [name]="item.icon" [size]="18"></tt-icon></span>
              <span class="drawer__label">{{ item.label }}</span>
              <tt-icon class="drawer__go" name="chevron" [size]="15" dir="auto"></tt-icon>
            </a>
          </li>
        </ul>

        <!-- Real offer, real price. Absent entirely when the catalog has not
             answered, rather than showing a placeholder deal. -->
        <a class="promo"
           *ngIf="featured$ | async as best"
           [routerLink]="['/products', best.slug]"
           [queryParams]="{ variant: best.variantId }"
           (click)="closeMenu()">
          <tt-coin-tier class="promo__art" [steps]="5"></tt-coin-tier>
          <span class="promo__text">
            <span class="promo__kicker">הערך הגבוה ביותר</span>
            <span class="promo__qty tt-numeric">{{ best.quantity }}</span>
            <span class="promo__price tt-numeric">{{ best.price }}</span>
          </span>
          <span class="promo__go"><tt-icon name="arrow" [size]="16" dir="auto"></tt-icon></span>
        </a>
      </div>

      <div class="drawer__foot">
        <!-- The primary action. A shop's menu should end on the thing it sells,
             not on a list of links. -->
        <a class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
           routerLink="/store" (click)="closeMenu()">
          קניית קוינס
        </a>

        <a class="drawer__cart" routerLink="/cart" (click)="closeMenu()">
          <tt-icon name="cart" [size]="17"></tt-icon>
          <span>העגלה שלי</span>
          <span class="drawer__cartcount" *ngIf="count() > 0">{{ count() }}</span>
        </a>

        <div class="drawer__assure">
          <span><tt-icon name="lock" [size]="14"></tt-icon> תשלום דרך ספק סליקה</span>
          <span><tt-icon name="headset" [size]="14"></tt-icon> תמיכה בעברית</span>
        </div>
      </div>
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
    .buy-cta {
      min-block-size: 40px;
      padding-inline: var(--tt-space-4);
      font-size: var(--tt-text-sm);
      white-space: nowrap;
      margin-inline-start: var(--tt-space-2);
    }
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

    /* Narrower than before. The search was taking four hundred and twenty
       pixels out of the middle of the bar, which left the navigation and the
       buy action fighting over what was left. */
    .search { flex: 1; max-inline-size: 320px; margin-inline-start: auto; }
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
      inset-block: 0;
      inset-inline-end: 0;
      z-index: calc(var(--tt-z-drawer) + 1);
      inline-size: min(86vw, 360px);
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(120% 60% at 100% 0%, var(--tt-brand-tint), transparent 60%),
        var(--tt-bg-elevated);
      border-inline-start: 1px solid var(--tt-border-strong);
      box-shadow: var(--tt-shadow-3);
      /* Slides rather than appearing. A panel that pops into place reads as a
         bug; the same panel arriving from the edge it is anchored to reads as
         a drawer. */
      transform: translateX(100%);
      /* Off-screen and inert, not hidden. visibility:hidden also empties
         innerText for everything inside, so the panel's links stopped
         reporting any text at all: invisible to a text-based reader of the
         page even though they carry real labels. The inert attribute on the
         closed panel is what actually keeps it out of focus order. */
      transition: transform var(--tt-duration) var(--tt-ease-out);
    }
    /* The panel is anchored with a logical inset, but a transform is physical,
       so the closed position has to be flipped for RTL by hand.
       Angular compiles :host-context() with a host attribute attached, which
       makes it beat a plain .drawer.open on specificity: without the matching
       RTL selector on the open rule the drawer slid off the left edge and
       stayed there, open and invisible. */
    :host-context([dir='rtl']) .drawer { transform: translateX(-100%); }
    .drawer.open,
    :host-context([dir='rtl']) .drawer.open {
      transform: translateX(0);
    }
    @media (prefers-reduced-motion: reduce) {
      .drawer { transition: none; }
    }

    .drawer__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border-block-end: 1px solid var(--tt-border);
    }
    .drawer__close {
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text-muted);
      cursor: pointer;
    }
    .drawer__close:hover { color: var(--tt-text); background: var(--tt-surface-2); }

    .drawer__scroll {
      flex: 1;
      overflow-y: auto;
      padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-4);
      overscroll-behavior: contain;
    }

    .drawer__nav { list-style: none; margin: 0 0 var(--tt-space-4); padding: 0; }
    .drawer__nav a {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      /* 52px: a comfortable thumb target, and the row height the rest of the
         product uses for primary actions. */
      min-block-size: 52px;
      padding-inline: var(--tt-space-2);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text);
      font-weight: 600;
    }
    .drawer__nav a:hover, .drawer__nav a.active {
      background: var(--tt-surface-2);
      text-decoration: none;
    }
    .drawer__glyph {
      display: grid;
      place-items: center;
      inline-size: 34px;
      block-size: 34px;
      flex: none;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface-2);
      color: var(--tt-text-muted);
      transform: skewX(-9deg);
    }
    .drawer__glyph tt-icon { transform: skewX(9deg); }
    .drawer__nav a.active .drawer__glyph {
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
    }
    .drawer__label { flex: 1; min-inline-size: 0; }
    .drawer__go { color: var(--tt-text-faint); flex: none; }

    /* The offer. Gold, because it is the only thing in here that costs money. */
    .promo {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      padding: var(--tt-space-3);
      border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-gold-500);
      background: linear-gradient(160deg, var(--tt-gold-tint), transparent 70%), var(--tt-surface);
      color: inherit;
    }
    .promo:hover { text-decoration: none; background: var(--tt-surface-2); }
    .promo__art { inline-size: 74px; flex: none; }
    .promo__text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-inline-size: 0; }
    .promo__kicker {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: var(--tt-tracking-eyebrow);
      color: var(--tt-gold-400);
    }
    .promo__qty { font-size: var(--tt-text-lg); font-weight: 900; line-height: 1.1; }
    .promo__price { font-size: var(--tt-text-sm); font-weight: 700; color: var(--tt-gold-400); }
    .promo__go { color: var(--tt-gold-400); flex: none; }

    .drawer__foot {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
    }
    .drawer__cart {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      min-block-size: 48px;
      padding-inline: var(--tt-space-3);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text);
      font-weight: 600;
      font-size: var(--tt-text-sm);
    }
    .drawer__cart:hover { background: var(--tt-surface-2); text-decoration: none; }
    .drawer__cart span:nth-of-type(1) { flex: 1; }
    .drawer__cartcount {
      display: grid;
      place-items: center;
      min-inline-size: 22px;
      block-size: 22px;
      padding-inline: 6px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-brand-500);
      color: var(--tt-text-on-brand);
      font-size: 11px;
      font-weight: 800;
    }
    .drawer__assure {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-2);
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
    }
    .drawer__assure span { display: flex; align-items: center; gap: var(--tt-space-2); }

    /* Below the desktop breakpoint the middle of the bar goes to search and the
       navigation moves into the drawer. */
    /* Below the desktop breakpoint the bar keeps brand, search and actions;
       the buy action lives in the drawer, where it is the primary button. */
    @media (max-width: 1000px) {
      .nav { display: none; }
      .buy-cta { display: none; }
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
  private readonly catalog = inject(CatalogFacade);

  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);

  /**
   * Whether the drawer exists at all.
   *
   * The drawer is mobile furniture, and hiding it with CSS was not enough: the
   * panel stayed in the document, so every desktop page carried a second,
   * invisible copy of the whole navigation. Anything walking the page in order,
   * a screen reader included, met those links first and found them unreachable.
   * Above the breakpoint the bar already holds the navigation, so the panel is
   * simply not rendered.
   */
  readonly isMobile = signal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1000px)').matches,
  );
  readonly count = this.cart.itemCount;

  /**
   * The whole site, because on a phone this drawer is the whole navigation.
   * Every row carries a distinct icon; a repeated glyph is worse than none.
   */
  readonly menu: readonly MenuItem[] = [
    { route: '/store', icon: 'tag', label: 'חנות קוינס' },
    { route: '/deals', icon: 'bolt', label: 'מבצעים' },
    { route: '/account/orders', icon: 'clock', label: 'ההזמנות שלי' },
    { route: '/account', icon: 'user', label: 'החשבון שלי' },
    { route: '/support', icon: 'headset', label: 'תמיכה' },
    { route: '/faq', icon: 'info', label: 'שאלות נפוצות' },
    { route: '/delivery', icon: 'truck', label: 'איך זה עובד' },
  ];

  /** Set the first time the drawer opens, so a closed drawer costs nothing. */
  private readonly opened = new BehaviorSubject<boolean>(false);

  /**
   * The best-value tier, for the offer in the drawer.
   *
   * Loaded lazily on first open rather than with the header, which renders on
   * every route: a menu nobody pressed should not cost a catalog request. The
   * block is absent if anything fails, never a placeholder price.
   */
  readonly featured$: Observable<FeaturedOffer | null> = this.opened.pipe(
    filter(Boolean),
    take(1),
    switchMap(() => this.catalog.productsForGame(STOREFRONT.focusGameSlug)),
    map((products) => products.find((product) => product.type === ProductType.GameCurrency)),
    switchMap((coins) => (coins
      ? this.catalog.productBySlug(coins.slug).pipe(catchError(() => of(null)))
      : of(null))),
    map((detail) => this.bestOf(detail)),
    catchError(() => of(null)),
    startWith(null),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  closeMenu(): void {
    this.menuOpen.set(false);
    this.lockScroll(false);
  }

  toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    this.lockScroll(next);
    if (next) {
      this.opened.next(true);
    }
  }

  /**
   * Stops the page behind the drawer from scrolling.
   *
   * Without it a swipe over the backdrop scrolls the store underneath, so the
   * customer closes the menu and finds themselves somewhere else on the page.
   */
  private lockScroll(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  /** The cheapest tier per coin, described for display. */
  private bestOf(detail: ProductDetail | null): FeaturedOffer | null {
    if (!detail) {
      return null;
    }

    const ranked = rankByValue(detail.offers, detail.product.variants)
      .filter((row) => row.perUnitMinor !== undefined);
    const best = ranked.find((row) => row.isBestValue) ?? ranked[0];

    if (!best) {
      return null;
    }

    const money = best.offer.price.current;
    return {
      slug: detail.product.slug,
      variantId: best.variant.id,
      quantity: formatQuantity(best.variant.quantityValue) || best.variant.name.he,
      price: `${Math.round(money.amountMinor / 100).toLocaleString('he-IL')} ₪`,
    };
  }

  @HostListener('window:resize')
  onResize(): void {
    const mobile = window.matchMedia('(max-width: 1000px)').matches;
    this.isMobile.set(mobile);
    if (!mobile) {
      this.menuOpen.set(false);
      this.lockScroll(false);
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    // A small threshold rather than zero, so a one-pixel trackpad bounce does
    // not flicker the bar.
    this.scrolled.set(window.scrollY > 8);
  }

}
