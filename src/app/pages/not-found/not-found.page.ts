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
      <a class="tt-btn tt-btn--primary tt-btn--lg" routerLink="/store">לחנות</a>
      <a class="quiet" routerLink="/support">משהו לא עובד? כתבו לנו</a>
    </div>
  `,
  styles: [`
    .wrap { gap: var(--tt-space-3); }
    /* Not blue, and not a gradient. Blue means pressable everywhere else on
       the site, and a status code is neither pressable nor the point of the
       page: the way out is. It sits back as a label above the sentence that
       actually tells the customer what happened. */
    .code {
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-lg);
      font-weight: 800;
      line-height: 1;
      letter-spacing: var(--tt-tracking-eyebrow);
      color: var(--tt-text-faint);
    }
    h1 { margin: 0; font-size: var(--tt-text-2xl); }
    .quiet {
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 4px;
      text-decoration-color: var(--tt-border-strong);
    }
    .wrap .tt-btn { margin-block-start: var(--tt-space-2); }
  `],
})
export class NotFoundPage {}
