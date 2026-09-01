import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { formatQuantity, OfferValue, rankByValue } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { Offer, ProductDetail, ProductVariant } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { CoinTierComponent } from './coin-tier.component';
import { IconComponent } from './icon.component';

/**
 * The bundle ladder: the price argument, made visible.
 *
 * A column of prices tells a customer what each bundle costs. It does not tell
 * them which one is worth buying, which is the question they are actually
 * asking. This shows the relationship instead: quantity, price, and what a
 * million coins costs at that tier, with a bar whose length is the value.
 *
 * The effect is that "buy more, pay less per coin" stops being a claim in
 * marketing copy and becomes something the customer reads off the page in a
 * second.
 *
 * Every figure comes from offers the server priced. The component computes
 * ratios and nothing else; it never decides what anything costs.
 */
@Component({
  selector: 'tt-bundle-ladder',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinTierComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ladder" *ngIf="rows.length > 0">
      <div class="row"
           *ngFor="let row of rows"
           [class.row--best]="row.isBestValue">
        <a class="row__link"
           [routerLink]="['/products', productSlug]"
           [queryParams]="{ variant: row.variant.id }">

          <div class="row__head">
            <tt-coin-tier class="row__art" [quantity]="row.variant.quantityValue"></tt-coin-tier>
            <span class="qty">{{ label(row) }}</span>
            <span class="tt-badge tt-badge--accent best" *ngIf="row.isBestValue">
              <tt-icon name="bolt" [size]="13"></tt-icon> הכי משתלם
            </span>
          </div>

          <!-- The bar is the argument. Longer means more coins for each shekel. -->
          <div class="meter" aria-hidden="true">
            <span class="meter__fill" [style.inline-size.%]="fillPercent(row)"></span>
          </div>

          <div class="row__foot">
            <span class="per-unit tt-numeric" *ngIf="row.perUnitMinor as perUnit">
              {{ { amountMinor: perUnit, currency: row.offer.price.current.currency } | money }}
              <span class="per-unit__label">למיליון</span>
            </span>
            <span class="tt-price">{{ row.offer.price.current | money }}</span>
          </div>
        </a>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Stacked on a phone, a row of tiers on anything wider. Five full-width
       rectangles down a 1200px page was a list, not a pricing table. */
    .ladder {
      display: grid;
      gap: var(--tt-space-2);
    }
    @media (min-width: 760px) {
      .ladder {
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: var(--tt-space-3);
        align-items: end;
      }
    }

    .row {
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease),
                  transform var(--tt-duration) var(--tt-ease);
    }
    .row:hover { border-color: var(--tt-border-strong); background: var(--tt-surface-2); }

    /* The best tier is marked in the value colour and lifted, so the ranking is
       visible before a number is read. */
    .row--best {
      border-color: var(--tt-gold-500);
      background: linear-gradient(180deg, var(--tt-gold-tint), transparent 65%), var(--tt-surface);
    }
    @media (min-width: 760px) {
      .row--best { transform: translateY(-10px); box-shadow: var(--tt-ring-gold), var(--tt-shadow-2); }
    }

    .row__link { display: block; padding: var(--tt-space-3) var(--tt-space-4); color: inherit; }
    .row__link:hover { text-decoration: none; }

    .row__head {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      margin-block-end: var(--tt-space-2);
    }
    .row__art { inline-size: 52px; flex: none; }
    .row--best .row__art { inline-size: 62px; }
    .qty {
      flex: none;
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-lg);
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .best { margin-inline-start: auto; gap: 3px; }

    .meter {
      block-size: 5px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-3);
      overflow: hidden;
    }
    .meter__fill {
      display: block;
      block-size: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--tt-gold-600), var(--tt-gold-400));
      transition: inline-size var(--tt-duration-slow) var(--tt-ease-out);
    }

    .row__foot {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--tt-space-2);
      margin-block-start: var(--tt-space-2);
    }
    .per-unit { color: var(--tt-text-muted); font-size: var(--tt-text-xs); }
    .per-unit__label { color: var(--tt-text-faint); }

    /* In a column the tier reads top to bottom: artwork, quantity, price. */
    @media (min-width: 760px) {
      .row__head { flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); }
      .row__art { inline-size: 64px; }
      .row--best .row__art { inline-size: 76px; }
      .best { margin-inline-start: 0; }
      .row__foot { flex-direction: column; align-items: flex-start; gap: 2px; }
    }
  `],
})
export class BundleLadderComponent {
  @Input({ required: true }) productSlug = '';

  /** The product's offers and variants, already loaded by the caller. */
  @Input() set detail(detail: ProductDetail | null | undefined) {
    if (!detail) {
      this.rows = [];
      return;
    }
    this.build(detail.offers, detail.product.variants);
  }

  rows: OfferValue[] = [];

  private build(offers: readonly Offer[], variants: readonly ProductVariant[]): void {
    // One platform and region only. Comparing a PS5 price against a PC price
    // would rank the platforms rather than the bundles.
    const first = offers[0];
    if (!first) {
      this.rows = [];
      return;
    }

    const comparable = offers.filter(
      (offer) => offer.platformId === first.platformId && offer.regionId === first.regionId,
    );

    this.rows = rankByValue(comparable, variants)
      .filter((row) => row.perUnitMinor !== undefined)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0));
  }

  label(row: OfferValue): string {
    const quantity = formatQuantity(row.variant.quantityValue);
    return quantity || row.variant.name.he;
  }

  /**
   * Bar length, scaled so the best tier fills it and the worst still shows.
   *
   * Value is the inverse of price per unit: cheaper per coin is a longer bar.
   * The floor of 30% stops the weakest tier reading as worthless.
   */
  fillPercent(row: OfferValue): number {
    const perUnits = this.rows
      .map((entry) => entry.perUnitMinor)
      .filter((value): value is number => value !== undefined);

    if (perUnits.length === 0 || row.perUnitMinor === undefined) {
      return 0;
    }

    const best = Math.min(...perUnits);
    const worst = Math.max(...perUnits);
    if (worst === best) {
      return 100;
    }

    const ratio = (worst - row.perUnitMinor) / (worst - best);
    return Math.round(30 + ratio * 70);
  }
}
