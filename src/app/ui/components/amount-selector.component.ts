import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinPlan, coinRange, formatQuantity, planForQuantity } from '../../core/value';
import { Offer, ProductDetail, ProductVariant } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { CoinTierComponent } from './coin-tier.component';
import { IconComponent } from './icon.component';

/**
 * "How many coins do you want?"
 *
 * This is the question the shop exists to answer, and until now the only way to
 * answer it was to pick one of five fixed boxes. A customer who wants three
 * million had to work out for themselves that it meant a 2M and a 1M.
 *
 * Three ways in, all driving one number: chips for the common amounts, a slider
 * for exploring, and a field for people who already know. Whatever the number
 * is, it is filled from bundles the server actually priced, and the breakdown is
 * shown rather than hidden. Nothing here computes a price: it adds up prices
 * that already exist.
 *
 * When the amount lands between bundles the plan rounds up, because that is the
 * only honest way to cover it, and the extra is stated on screen before anyone
 * presses buy.
 */
@Component({
  selector: 'tt-amount-selector',
  standalone: true,
  imports: [CommonModule, MoneyPipe, CoinTierComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="picker" *ngIf="plan() as current">
      <header class="picker__head">
        <h2>כמה קוינס אתם צריכים?</h2>
        <p>בחרו סכום. אנחנו מרכיבים אותו מהחבילות שיוצאות הכי משתלם.</p>
      </header>

      <div class="picker__body">
        <div class="readout">
          <span class="readout__value tt-numeric">{{ display() }}</span>
          <span class="readout__unit">קוינס</span>
        </div>

        <!-- Chips first: most people want a round number and are done here. -->
        <ul class="chips">
          <li *ngFor="let preset of presets">
            <button type="button"
                    class="chip"
                    [class.on]="requested() === preset"
                    (click)="setAmount(preset)">
              {{ label(preset) }}
            </button>
          </li>
        </ul>

        <label class="slider">
          <span class="tt-visually-hidden">כמות קוינס</span>
          <input type="range"
                 [min]="range.min"
                 [max]="range.max"
                 [step]="range.step"
                 [value]="requested()"
                 (input)="onSlide($event)"
                 [attr.aria-valuetext]="display() + ' קוינס'" />
          <span class="slider__ends tt-numeric">
            <span>{{ label(range.min) }}</span>
            <span>{{ label(range.max) }}</span>
          </span>
        </label>

        <label class="exact">
          <span class="tt-label">או הקלידו כמות</span>
          <input class="tt-input tt-numeric"
                 type="text"
                 inputmode="numeric"
                 autocomplete="off"
                 [value]="display()"
                 (change)="onType($event)"
                 aria-label="כמות קוינס מדויקת" />
        </label>
      </div>

      <aside class="quote">
        <tt-coin-tier class="quote__art" [steps]="artSteps()"></tt-coin-tier>

        <p class="quote__rounded" *ngIf="current.provided > current.requested">
          <tt-icon name="info" [size]="14"></tt-icon>
          מעגלים ל־{{ label(current.provided) }} כדי להרכיב את הכמות מחבילות מלאות.
        </p>

        <ul class="quote__lines">
          <li *ngFor="let line of current.lines">
            <span>{{ line.count }} × {{ label(line.quantityEach) }}</span>
            <span class="tt-numeric">{{ lineTotal(line.offer, line.count) | money }}</span>
          </li>
        </ul>

        <div class="quote__total">
          <span>לתשלום</span>
          <span class="tt-price tt-numeric">{{ current.total | money }}</span>
        </div>

        <p class="quote__rate tt-numeric">
          {{ { amountMinor: current.perMillionMinor, currency: current.total.currency } | money }}
          <span>למיליון</span>
        </p>

        <button type="button"
                class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
                [disabled]="busy"
                (click)="confirm.emit(current)">
          <span>{{ busy ? 'מוסיפים…' : 'הוספה לסל' }}</span>
          <span class="tt-numeric" *ngIf="!busy">{{ current.total | money }}</span>
        </button>
      </aside>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .picker {
      display: grid;
      gap: var(--tt-stack);
      align-items: start;
    }
    @media (min-width: 900px) {
      .picker {
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
        grid-template-areas: 'head quote' 'body quote';
        column-gap: var(--tt-space-7);
      }
      .picker__head { grid-area: head; }
      .picker__body { grid-area: body; }
      .quote { grid-area: quote; }
    }

    .picker__head h2 { margin: 0 0 var(--tt-space-2); }
    .picker__head p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }

    .picker__body { display: flex; flex-direction: column; gap: var(--tt-space-5); }

    /* The number is the interface. It is set at display size because it is what
       the customer is manipulating, not a label describing something else. */
    .readout { display: flex; align-items: baseline; gap: var(--tt-space-2); }
    .readout__value {
      font-size: clamp(2.6rem, 9vw, 4rem);
      font-weight: 900;
      line-height: 0.9;
      letter-spacing: -0.04em;
      color: var(--tt-gold-400);
    }
    .readout__unit { font-size: var(--tt-text-md); font-weight: 700; color: var(--tt-text-muted); }

    .chips { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); margin: 0; padding: 0; list-style: none; }
    .chip {
      min-block-size: 42px;
      padding-inline: var(--tt-space-4);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-family: var(--tt-font-numeric);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .chip:hover { border-color: var(--tt-border-strong); }
    .chip.on {
      border-color: var(--tt-gold-500);
      background: var(--tt-gold-tint);
      color: var(--tt-gold-300);
    }

    /* A real control, not the browser's. The track carries the fill so the
       position reads as an amount rather than as a widget. */
    .slider { display: block; }
    .slider input {
      inline-size: 100%;
      /* A numeric range reads low on the left in every script. Inheriting RTL
         put the minimum on the right while the labels underneath still read
         low-to-high, so the thumb moved opposite to the number beside it. */
      direction: ltr;
      block-size: 34px;
      margin: 0;
      background: transparent;
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
    }
    .slider input::-webkit-slider-runnable-track {
      block-size: 6px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-3);
    }
    .slider input::-moz-range-track {
      block-size: 6px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-3);
    }
    .slider input::-moz-range-progress {
      block-size: 6px;
      border-radius: var(--tt-radius-pill);
      background: linear-gradient(90deg, var(--tt-gold-600), var(--tt-gold-400));
    }
    .slider input::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      inline-size: 26px;
      block-size: 26px;
      margin-block-start: -10px;
      border: 2px solid var(--tt-bg);
      border-radius: 50%;
      background: linear-gradient(160deg, var(--tt-gold-300), var(--tt-gold-600));
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }
    .slider input::-moz-range-thumb {
      inline-size: 26px;
      block-size: 26px;
      border: 2px solid var(--tt-bg);
      border-radius: 50%;
      background: linear-gradient(160deg, var(--tt-gold-300), var(--tt-gold-600));
    }
    .slider input:focus-visible { outline: 2px solid var(--tt-brand-400); outline-offset: 4px; }
    .slider__ends {
      display: flex;
      justify-content: space-between;
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
      direction: ltr;
      unicode-bidi: isolate;
    }

    .exact { display: flex; flex-direction: column; gap: var(--tt-space-2); max-inline-size: 15rem; }
    .exact input { text-align: start; direction: ltr; }

    /* The quote. One bordered surface on the whole module, because this is the
       part that takes money and should look like it. */
    .quote {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border: 1px solid var(--tt-gold-500);
      border-radius: var(--tt-radius-lg);
      background: linear-gradient(180deg, var(--tt-gold-tint), transparent 55%), var(--tt-surface);
    }
    .quote__art { inline-size: 130px; align-self: center; }

    .quote__rounded {
      display: flex;
      align-items: flex-start;
      gap: var(--tt-space-2);
      margin: 0;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }
    .quote__rounded tt-icon { flex: none; margin-block-start: 1px; }

    .quote__lines { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .quote__lines li {
      display: flex;
      justify-content: space-between;
      gap: var(--tt-space-3);
      font-size: var(--tt-text-sm);
      color: var(--tt-text-muted);
    }

    .quote__total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--tt-space-3);
      padding-block-start: var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
      font-weight: 700;
    }
    .quote__rate { margin: 0; color: var(--tt-text-faint); font-size: var(--tt-text-xs); }
    .quote .tt-btn { justify-content: space-between; }
  `],
})
export class AmountSelectorComponent {
  @Input({ required: true }) set detail(detail: ProductDetail | null | undefined) {
    if (!detail) {
      this.offers = [];
      this.variants = [];
      return;
    }

    // One platform and region, so the plan cannot mix a PC price with a PS5 one.
    const first = detail.offers[0];
    this.offers = first
      ? detail.offers.filter(
        (offer) => offer.platformId === first.platformId && offer.regionId === first.regionId,
      )
      : [];
    this.variants = detail.product.variants;
    this.reset();
  }

  /** Set while the caller is adding the plan to the cart. */
  @Input() busy = false;

  @Output() readonly confirm = new EventEmitter<CoinPlan>();

  private offers: readonly Offer[] = [];
  private variants: readonly ProductVariant[] = [];

  readonly requested = signal(0);
  range = { min: 0, max: 0, step: 1 };
  presets: readonly number[] = [];

  readonly plan = computed<CoinPlan | null>(
    () => planForQuantity(this.offers, this.variants, this.requested()),
  );

  /** The figure under the customer's thumb, grouped for reading. */
  readonly display = computed(() => this.requested().toLocaleString('he-IL'));

  /**
   * Drives the artwork.
   *
   * Keyed to the amount itself, not to the thumb's position in the range: with
   * a ceiling of twenty million, two million sat under ten percent of the track
   * and drew the single-coin composition, which told the customer their order
   * was small. The thresholds match the tiers the catalogue actually sells, and
   * a plan built from more than one bundle earns a step.
   */
  readonly artSteps = computed(() => {
    const current = this.plan();
    if (!current) {
      return 1;
    }

    const provided = current.provided;
    const base = provided <= 250_000 ? 1
      : provided <= 1_000_000 ? 2
        : provided <= 2_000_000 ? 3
          : 4;

    const units = current.lines.reduce((count, line) => count + line.count, 0);
    return Math.min(5, base + (units > 1 ? 1 : 0));
  });

  private reset(): void {
    const range = coinRange(this.offers, this.variants);
    if (!range) {
      return;
    }

    this.range = range;
    this.presets = this.buildPresets(range.min, range.max);
    // Opens on the largest single bundle: the tier the value argument is about.
    const largest = this.variants
      .map((variant) => variant.quantityValue ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    this.requested.set(largest || range.min);
  }

  /**
   * The chips.
   *
   * Every bundle we sell, plus a few round multiples of the largest so the top
   * of the range is reachable in one tap rather than by dragging.
   */
  private buildPresets(min: number, max: number): readonly number[] {
    const fromVariants = this.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    const largest = Math.max(...fromVariants, min);
    const multiples = [largest * 2, largest * 5, largest * 10];

    return [...new Set([...fromVariants, ...multiples])]
      .filter((value) => value >= min && value <= max)
      .sort((a, b) => a - b);
  }

  setAmount(value: number): void {
    const clamped = Math.min(this.range.max, Math.max(this.range.min, Math.round(value)));
    this.requested.set(clamped);
  }

  onSlide(event: Event): void {
    this.setAmount(Number((event.target as HTMLInputElement).value));
  }

  /** Accepts "2,000,000", "2000000" and "2m", because people type all three. */
  onType(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim().toLowerCase().replace(/[,\s]/g, '');
    const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(raw);

    if (match) {
      const scale = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
      this.setAmount(Number(match[1]) * scale);
    }

    // Always rewrite the field from the accepted value, so a rejected or
    // clamped entry cannot leave the box disagreeing with the price beside it.
    input.value = this.display();
  }

  label(value: number): string {
    return formatQuantity(value) || value.toLocaleString('he-IL');
  }

  lineTotal(offer: Offer, count: number) {
    return { amountMinor: offer.price.current.amountMinor * count, currency: offer.price.current.currency };
  }
}
