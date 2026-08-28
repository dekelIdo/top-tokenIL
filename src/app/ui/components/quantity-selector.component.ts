import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Quantity stepper.
 *
 * The maximum comes from the offer's inventory, so a component can never let a
 * customer order more than the seller can deliver. Direction is handled by the
 * flex row rather than by left/right rules, so it mirrors correctly in RTL.
 */
@Component({
  selector: 'tt-quantity-selector',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stepper">
      <button type="button" class="step" (click)="step(-1)" [disabled]="value <= min" aria-label="הפחתת כמות">−</button>
      <span class="value" aria-live="polite">{{ value }}</span>
      <button type="button" class="step" (click)="step(1)" [disabled]="value >= max" aria-label="הוספת כמות">+</button>
    </div>
  `,
  styles: [`
    .stepper {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-2);
      overflow: hidden;
    }
    .step {
      inline-size: 40px;
      block-size: 40px;
      border: 0;
      background: transparent;
      color: var(--tt-text);
      font-size: var(--tt-text-lg);
      cursor: pointer;
    }
    .step:disabled { opacity: 0.4; cursor: not-allowed; }
    .step:hover:not(:disabled) { background: var(--tt-surface-3); }
    .value { min-inline-size: 40px; text-align: center; font-weight: 600; }
  `],
})
export class QuantitySelectorComponent {
  @Input() value = 1;
  @Input() min = 1;
  @Input() max = 10;
  @Output() readonly valueChange = new EventEmitter<number>();

  step(delta: number): void {
    const next = Math.min(this.max, Math.max(this.min, this.value + delta));
    if (next !== this.value) {
      this.valueChange.emit(next);
    }
  }
}
