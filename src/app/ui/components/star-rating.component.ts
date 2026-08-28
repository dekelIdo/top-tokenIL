import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Read-only rating display. Half stars are rounded down deliberately. */
@Component({
  selector: 'tt-star-rating',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="wrap" [attr.aria-label]="'דירוג ' + rating + ' מתוך 5'">
      <span class="stars" aria-hidden="true">
        <span *ngFor="let star of stars" [class.on]="star">★</span>
      </span>
      <span class="tt-faint" *ngIf="count !== undefined">({{ count }})</span>
    </span>
  `,
  styles: [`
    .wrap { display: inline-flex; align-items: center; gap: var(--tt-space-2); }
    .stars { display: inline-flex; gap: 1px; color: var(--tt-text-faint); font-size: var(--tt-text-sm); }
    .stars .on { color: var(--tt-warning); }
  `],
})
export class StarRatingComponent {
  @Input() rating = 0;
  @Input() count?: number;

  get stars(): readonly boolean[] {
    const filled = Math.round(this.rating);
    return [1, 2, 3, 4, 5].map((position) => position <= filled);
  }
}
