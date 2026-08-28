import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tt-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section wrap">
      <span class="code">404</span>
      <h1>הדף שחיפשתם לא קיים</h1>
      <p class="tt-muted">ייתכן שהקישור ישן, או שהמוצר כבר לא בקטלוג.</p>
      <div class="tt-row">
        <a class="tt-btn tt-btn--primary" routerLink="/store">לחנות</a>
        <a class="tt-btn tt-btn--ghost" routerLink="/support">לתמיכה</a>
      </div>
    </div>
  `,
  styles: [`
    .wrap { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--tt-space-3); }
    .code { font-size: var(--tt-text-4xl); font-weight: 800; color: var(--tt-brand-500); }
  `],
})
export class NotFoundPage {}
