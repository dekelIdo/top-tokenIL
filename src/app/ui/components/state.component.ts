import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AppError } from '../../domain';

/**
 * The three states every asynchronous surface needs, as components rather than
 * as `*ngIf` blocks copy-pasted into each page.
 *
 * Loading is a skeleton shaped like the content it replaces, not a spinner that
 * blanks the page — the layout stays still while data arrives.
 */

@Component({
  selector: 'tt-skeleton-grid',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-grid" aria-hidden="true">
      <div class="card" *ngFor="let placeholder of placeholders">
        <div class="tt-skeleton media"></div>
        <div class="tt-skeleton line line--lg"></div>
        <div class="tt-skeleton line"></div>
        <div class="tt-skeleton line line--sm"></div>
      </div>
    </div>
  `,
  styles: [`
    /* Height is matched to tt-product-card so replacing the skeleton with real
       content shifts nothing. Keep the two in step if either changes. */
    .card {
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-lg);
      padding: var(--tt-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-3);
      block-size: 358px;
    }
    .media { block-size: 148px; flex: none; }
    .line { block-size: 12px; flex: none; }
    .line--lg { block-size: 22px; inline-size: 70%; }
    .line--sm { inline-size: 40%; margin-block-start: auto; }
  `],
})
export class SkeletonGridComponent {
  @Input() count = 6;

  get placeholders(): readonly number[] {
    return Array.from({ length: this.count }, (_, index) => index);
  }
}

@Component({
  selector: 'tt-empty-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="glyph" aria-hidden="true">{{ icon }}</div>
      <h2>{{ title }}</h2>
      <p class="tt-muted">{{ message }}</p>
      <button type="button" class="tt-btn tt-btn--ghost" *ngIf="actionLabel" (click)="action.emit()">
        {{ actionLabel }}
      </button>
    </div>
  `,
  styles: [`
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-2);
      padding: var(--tt-space-7) var(--tt-space-4);
    }
    .glyph { font-size: 3rem; line-height: 1; margin-block-end: var(--tt-space-2); }
    h2 { font-size: var(--tt-text-xl); }
    p { max-inline-size: 44ch; }
  `],
})
export class EmptyStateComponent {
  @Input() icon = '🔍';
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel?: string;
  @Output() readonly action = new EventEmitter<void>();
}

/**
 * Error surface. It renders `AppError.userMessage` only — the technical message
 * stays in the console where it belongs.
 */
@Component({
  selector: 'tt-error-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" role="alert">
      <div class="glyph" aria-hidden="true">⚠️</div>
      <h2>{{ title }}</h2>
      <p class="tt-muted">{{ message }}</p>
      <button type="button" class="tt-btn tt-btn--primary" *ngIf="error?.retryable !== false" (click)="retry.emit()">
        נסו שוב
      </button>
    </div>
  `,
  styles: [`
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-2);
      padding: var(--tt-space-7) var(--tt-space-4);
    }
    .glyph { font-size: 2.5rem; line-height: 1; }
    h2 { font-size: var(--tt-text-xl); }
    p { max-inline-size: 44ch; }
  `],
})
export class ErrorStateComponent {
  @Input() error?: AppError;
  @Input() title = 'משהו השתבש';
  @Input() fallbackMessage = 'לא הצלחנו לטעון את התוכן. אפשר לנסות שוב.';
  @Output() readonly retry = new EventEmitter<void>();

  get message(): string {
    return this.error?.userMessage.he ?? this.fallbackMessage;
  }
}
