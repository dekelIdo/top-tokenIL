import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { Platform, Product, Region } from '../../domain';
import { CatalogLookups } from '../../state/catalog.facade';
import { MoneyPipe } from '../money.pipe';
import { PlatformBadgeComponent, RegionBadgeComponent } from './badges.component';
import { StarRatingComponent } from './star-rating.component';

/**
 * The catalog's primary card.
 *
 * It is product-type agnostic: it shows a name, a "from" price, the platforms and
 * regions the product is sold for, and a rating when one exists. Nothing in it
 * knows about coins, so a gift card and a coin bundle render through the same
 * component.
 */
@Component({
  selector: 'tt-product-card',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe,
    PlatformBadgeComponent, RegionBadgeComponent, StarRatingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card" [routerLink]="['/products', product.slug]" [attr.aria-label]="product.name | t">
      <div class="media">
        <img *ngIf="product.images[0] as image" [src]="image.url" [alt]="image.alt" loading="lazy" />
        <span class="tt-badge tt-badge--brand featured" *ngIf="product.featured">מומלץ</span>
      </div>

      <div class="body">
        <h2 class="name">{{ product.name | t }}</h2>
        <p class="desc tt-muted">{{ product.shortDescription | t }}</p>

        <div class="tt-row meta">
          <tt-platform-badge *ngFor="let platform of platforms" [platform]="platform"></tt-platform-badge>
          <tt-region-badge *ngFor="let region of regions" [region]="region"></tt-region-badge>
        </div>

        <tt-star-rating
          *ngIf="product.ratingAverage !== undefined"
          [rating]="product.ratingAverage"
          [count]="product.ratingCount">
        </tt-star-rating>
      </div>

      <div class="foot">
        <span class="from tt-faint">החל מ־</span>
        <span class="price">{{ product.fromPrice?.current | money }}</span>
      </div>
    </a>
  `,
  styles: [`
    .card {
      display: flex;
      flex-direction: column;
      block-size: 358px;
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
      transform: translateY(-3px);
      border-color: var(--tt-border-strong);
      box-shadow: var(--tt-shadow-2);
      text-decoration: none;
    }
    .media {
      position: relative;
      block-size: 148px;
      flex: none;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 50% 30%, var(--tt-surface-3), var(--tt-surface));
    }
    .media img { max-block-size: 108px; object-fit: contain; }
    .featured { position: absolute; inset-block-start: var(--tt-space-3); inset-inline-start: var(--tt-space-3); }
    .body {
      padding: var(--tt-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-2);
      flex: 1;
      min-block-size: 0;
      overflow: hidden;
    }
    .name { font-size: var(--tt-text-lg); margin: 0; font-weight: 700; }
    .desc {
      font-size: var(--tt-text-sm);
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .meta { gap: var(--tt-space-1); }
    .foot {
      margin-block-start: auto;
      display: flex;
      align-items: baseline;
      gap: var(--tt-space-2);
      padding: var(--tt-space-3) var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
      background: var(--tt-surface-2);
    }
    .price { font-size: var(--tt-text-xl); font-weight: 700; }
  `],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() lookups?: CatalogLookups;

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
