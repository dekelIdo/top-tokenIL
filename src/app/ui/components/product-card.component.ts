import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, savedAmount } from '../../core/value';
import { Money, Platform, Product, Region } from '../../domain';
import { CatalogLookups } from '../../state/catalog.facade';
import { MoneyPipe } from '../money.pipe';
import { PlatformBadgeComponent, RegionBadgeComponent } from './badges.component';

/**
 * The catalog's primary card.
 *
 * Rebuilt for density and for commerce. The previous card was tall, mostly
 * illustration, and told a customer only a name and a "from" price, which meant
 * one card filled a phone screen and answered none of the questions a buyer
 * actually has. This one answers four in the space the old one used for one:
 * what it is, how much you get, what it costs, and what you save.
 *
 * Two cards fit across a 360px phone. That is the difference between browsing a
 * catalogue and scrolling a brochure.
 *
 * Colour carries meaning and is not decoration: gold is money, violet is
 * something you can press, white is information. Nothing here invents a badge.
 * "Sale" appears only against a real strike-through price, and the quantity
 * range is read from the product's own variants.
 */
@Component({
  selector: 'tt-product-card',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe,
    PlatformBadgeComponent, RegionBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card" [routerLink]="['/products', product.slug]" [attr.aria-label]="product.name | t">
      <div class="media">
        <img *ngIf="product.images[0] as image"
             [src]="image.url" [alt]="image.alt" loading="lazy" decoding="async" />

        <span class="flag flag--save" *ngIf="saved as amount">
          חוסכים {{ amount | money }}
        </span>
        <span class="flag flag--featured" *ngIf="!saved && product.featured">מומלץ</span>
      </div>

      <div class="body">
        <h3 class="name">{{ product.name | t }}</h3>

        <!-- How much you get. Read from the product's own variants, so a card
             with no quantity tiers simply does not show one. -->
        <p class="range" *ngIf="quantityRange as range">{{ range }}</p>

        <div class="chips">
          <tt-platform-badge *ngFor="let platform of platforms | slice:0:3" [platform]="platform"></tt-platform-badge>
          <tt-region-badge *ngFor="let region of regions | slice:0:1" [region]="region"></tt-region-badge>
        </div>
      </div>

      <div class="foot">
        <div class="foot__price">
          <span class="foot__from">החל מ־</span>
          <span class="tt-price">{{ product.fromPrice?.current | money }}</span>
        </div>
        <span class="was" *ngIf="product.fromPrice?.compareAt as was">{{ was | money }}</span>
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
      border-radius: var(--tt-radius-lg);
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      transition: transform var(--tt-duration) var(--tt-ease),
                  border-color var(--tt-duration) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--tt-border-brand);
      box-shadow: var(--tt-shadow-2);
      text-decoration: none;
    }
    .card:hover .media img { transform: scale(1.05); }

    .media {
      position: relative;
      /* A ratio rather than a fixed height, so the card scales with the column
         instead of leaving a tall empty box on a narrow screen. */
      aspect-ratio: 16 / 10;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 118%, var(--tt-brand-tint), transparent 60%),
        var(--tt-surface-2);
      border-block-end: 1px solid var(--tt-border);
    }
    .media img {
      inline-size: 62%;
      max-block-size: 78%;
      object-fit: contain;
      transition: transform var(--tt-duration-slow) var(--tt-ease-out);
    }

    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      padding: 0.15rem 0.5rem;
      border-radius: var(--tt-radius-sm);
      font-size: 11px;
      font-weight: 800;
      line-height: 1.6;
      white-space: nowrap;
    }
    /* Money saved is the loudest thing a card can say, so it takes the gold. */
    .flag--save { background: var(--tt-gold-500); color: var(--tt-text-on-gold); }
    .flag--featured { background: var(--tt-brand-tint); color: var(--tt-brand-300); }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-1);
      padding: var(--tt-space-3);
      flex: 1;
      min-block-size: 0;
    }
    .name {
      margin: 0;
      font-size: var(--tt-text-sm);
      font-weight: 700;
      line-height: var(--tt-leading-snug);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .range {
      margin: 0;
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-xs);
      color: var(--tt-text-muted);
      /* A numeric range reads left to right even inside Hebrew. Without the
         isolate the bidi algorithm reorders it and "50 - 250" renders as
         "250 - 50", which states the opposite of the truth. */
      direction: ltr;
      unicode-bidi: isolate;
      text-align: end;
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
      align-items: baseline;
      gap: var(--tt-space-2);
      padding: var(--tt-space-2) var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
      background: var(--tt-bg-elevated);
    }
    .foot__price { display: flex; align-items: baseline; gap: 4px; }
    .foot__from { font-size: 10px; color: var(--tt-text-faint); }
    .was {
      margin-inline-start: auto;
      font-family: var(--tt-font-numeric);
      font-size: var(--tt-text-xs);
      color: var(--tt-text-faint);
      text-decoration: line-through;
    }

    /* Chips are the first thing to go when the card gets narrow: a platform
       badge matters less than the price being readable. */
    @media (max-width: 400px) {
      .chips { display: none; }
      .body { padding: var(--tt-space-2); }
    }
  `],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() lookups?: CatalogLookups;

  /** What a real strike-through saves, or undefined when there is not one. */
  get saved(): Money | undefined {
    return this.product.fromPrice ? savedAmount(this.product.fromPrice) : undefined;
  }

  /**
   * The span of quantities this product sells, as players say them.
   *
   * Undefined when the variants carry no quantity, which is the case for a gift
   * card or a subscription. Those cards simply omit the line rather than
   * showing something invented.
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
