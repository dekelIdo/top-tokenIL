import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tt-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section wrap tt-page-center">
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
    .wrap { gap: var(--tt-space-3); }
        .code {
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-5xl);
      font-weight: 900;
      line-height: 1;
      letter-spacing: var(--tt-tracking-display);
      background: linear-gradient(140deg, var(--tt-brand-400), var(--tt-brand-700));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    h1 { margin: 0; font-size: var(--tt-text-2xl); }
  `],
})
export class NotFoundPage {}
