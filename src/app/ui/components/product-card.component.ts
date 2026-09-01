import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, savedAmount } from '../../core/value';
import { Money, Platform, Product, Region } from '../../domain';
import { CatalogLookups } from '../../state/catalog.facade';
import { MoneyPipe } from '../money.pipe';
import { PlatformBadgeComponent, RegionBadgeComponent } from './badges.component';
import { CoinTierComponent } from './coin-tier.component';
import { IconComponent } from './icon.component';

/**
 * A purchase unit.
 *
 * Rebuilt around the order a buyer actually reads a card in: how much am I
 * getting, what does it cost, and where do I press. The previous card led with
 * the product's name in the largest type on it, which is the least useful thing
 * on the card. Everyone browsing already knows they are looking at coins; what
 * they are choosing between is amounts and prices.
 *
 * So the hierarchy is now quantity first at display size, price second in gold,
 * savings third and small, and a visible action last. The name drops to a
 * caption above the figure, where it identifies the product without competing
 * with it.
 *
 * Colour carries meaning and is never decoration: gold is money, blue is
 * something you can press, white is information. Nothing here invents a badge.
 * A saving appears only against a real strike-through price the server sent,
 * and the quantity is read from the product's own variants.
 */
@Component({
  selector: 'tt-product-card',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe,
    PlatformBadgeComponent, RegionBadgeComponent, CoinTierComponent, IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card" [routerLink]="['/products', product.slug]" [attr.aria-label]="product.name | t">
      <div class="media">
        <!-- Coin bundles draw their own tier, so the artwork carries the size
             of the bundle. Anything else uses its own illustration. -->
        <tt-coin-tier *ngIf="largestQuantity as quantity; else artwork"
                      class="media__art" [quantity]="quantity"></tt-coin-tier>
        <ng-template #artwork>
          <img *ngIf="product.images[0] as image"
               [src]="image.url" [alt]="image.alt" loading="lazy" decoding="async" />
        </ng-template>

        <span class="flag" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
      </div>

      <div class="body">
        <!-- Caption then figure. A product with no quantity has no figure, so
             it promotes its name rather than printing it on both lines. -->
        <ng-container *ngIf="quantityRange as range; else named">
          <p class="name">{{ product.name | t }}</p>
          <p class="amount tt-numeric">{{ range }}</p>
        </ng-container>
        <ng-template #named>
          <p class="amount amount--words">{{ product.name | t }}</p>
        </ng-template>

        <div class="chips">
          <tt-platform-badge *ngFor="let platform of platforms | slice:0:3" [platform]="platform"></tt-platform-badge>
          <tt-region-badge *ngFor="let region of regions | slice:0:1" [region]="region"></tt-region-badge>
        </div>
      </div>

      <div class="foot">
        <span class="foot__price">
          <span class="foot__from">החל מ־</span>
          <span class="tt-price">{{ product.fromPrice?.current | money }}</span>
          <span class="was" *ngIf="product.fromPrice?.compareAt as was">{{ was | money }}</span>
        </span>
        <span class="go" aria-hidden="true">
          <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
        </span>
      </div>
    </a>
  `,
  styles: [`
    .card {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease);
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--tt-border-strong);
      text-decoration: none;
    }

    .media {
      position: relative;
      /* Cropped tighter than before. The artwork identifies the product; it is
         not the reason anyone is looking at the card. */
      aspect-ratio: 16 / 8;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--tt-bg-elevated);
    }
    .media__art { inline-size: 76%; }
    .media img {
      inline-size: 56%;
      max-block-size: 82%;
      object-fit: contain;
      transition: transform var(--tt-duration-slow) var(--tt-ease-out);
    }
    .card:hover .media img { transform: scale(1.04); }

    /* Money saved is the loudest thing a card can say, so it takes the gold. */
    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      padding: 0.1rem 0.4rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.7;
      white-space: nowrap;
    }

    .body {
      display: flex;
      flex-direction: column;
      padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2);
      flex: 1;
      min-block-size: 0;
    }

    /* A caption, not a heading. It identifies the product above the figure. */
    .name {
      margin: 0;
      font-size: var(--tt-text-xs);
      font-weight: 600;
      color: var(--tt-text-faint);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .amount {
      margin: 2px 0 0;
      font-size: var(--tt-text-xl);
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: -0.025em;
      /* A numeric range reads left to right even inside Hebrew. Without the
         isolate the bidi algorithm reorders it and "100K-2M" renders as
         "2M-100K", which states the opposite of the truth. */
      direction: ltr;
      unicode-bidi: isolate;
      text-align: end;
    }
    /* Products with no quantity fall back to their name, which is prose and
       must not inherit the numeric direction or the tight tracking. */
    .amount--words {
      direction: rtl;
      font-size: var(--tt-text-md);
      letter-spacing: normal;
      line-height: var(--tt-leading-snug);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-block-start: auto;
      padding-block-start: var(--tt-space-2);
    }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-2);
      padding: var(--tt-space-2) var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
    }
    .foot__price { display: flex; align-items: baseline; gap: 4px; min-inline-size: 0; }
    .foot__from { font-size: 10px; color: var(--tt-text-faint); }
    .was {
      font-family: var(--tt-font-numeric);
      font-size: var(--tt-text-xs);
      color: var(--tt-text-faint);
      text-decoration: line-through;
    }

    /* The action. A chevron in the interactive colour rather than a button:
       the whole card is the target, and a button inside a link is a lie about
       what is clickable. */
    .go {
      display: grid;
      place-items: center;
      inline-size: 26px;
      block-size: 26px;
      flex: none;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
      transition: background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .card:hover .go { background: var(--tt-brand-500); color: var(--tt-text-on-brand); }

    /* Chips are the first thing to go when the card gets narrow: a platform
       badge matters less than the price staying readable. */
    @media (max-width: 400px) {
      .chips { display: none; }
      .body { padding: var(--tt-space-2) var(--tt-space-2) var(--tt-space-1); }
      .amount { font-size: var(--tt-text-lg); }
    }
  `],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() lookups?: CatalogLookups;

  /** The biggest tier this product sells, which drives the artwork. */
  get largestQuantity(): number | undefined {
    const quantities = this.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return quantities.length > 0 ? Math.max(...quantities) : undefined;
  }

  /** What a real strike-through saves, or undefined when there is not one. */
  get saved(): Money | undefined {
    return this.product.fromPrice ? savedAmount(this.product.fromPrice) : undefined;
  }

  /**
   * The span of quantities this product sells, as players say them.
   *
   * Undefined when the variants carry no quantity, which is the case for a
   * service. Those cards fall back to the product name rather than showing
   * something invented.
   */
  get quantityRange(): string | undefined {
    const quantities = this.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0)
      .sort((a, b) => a - b);

    if (quantities.length === 0) {
      return undefined;
    }

    const smallest = formatQuantity(quantities[0]);
    const largest = formatQuantity(quantities[quantities.length - 1]);
    return smallest === largest ? smallest : `${smallest}–${largest}`;
  }

  get platforms(): readonly Platform[] {
    return this.resolve(this.product.platformIds, this.lookups?.platforms);
  }

  get regions(): readonly Region[] {
    return this.resolve(this.product.regionIds, this.lookups?.regions);
  }

  private resolve<T>(ids: readonly string[], source: ReadonlyMap<string, T> | undefined): readonly T[] {
    if (!source) {
      return [];
    }
    return ids.map((id) => source.get(id)).filter((value): value is T => value !== undefined);
  }
}
