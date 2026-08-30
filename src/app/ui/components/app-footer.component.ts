import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Footer. It carries the legal and policy links an Israeli consumer store needs,
 * and states plainly that the site is in development and runs a payment
 * simulation — the storefront never implies a live integration it lacks.
 */
@Component({
  selector: 'tt-app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="foot">
      <div class="tt-container">
        <div class="cols">
          <div>
            <strong class="brand">TOP TOKEN</strong>
            <p class="tt-faint">חנות דיגיטלית למוצרי גיימינג: קודים, מנויים ומטבעות משחק.</p>
          </div>
          <nav>
            <h2 class="col-title">חנות</h2>
            <a routerLink="/store">כל המוצרים</a>
            <a routerLink="/games">משחקים</a>
            <a routerLink="/deals">מבצעים</a>
            <a routerLink="/reviews">ביקורות</a>
          </nav>
          <nav>
            <h2 class="col-title">שירות</h2>
            <a routerLink="/support">תמיכה</a>
            <a routerLink="/faq">שאלות נפוצות</a>
            <a routerLink="/contact">צור קשר</a>
            <a routerLink="/account/orders">ההזמנות שלי</a>
          </nav>
          <nav>
            <h2 class="col-title">מידע</h2>
            <a routerLink="/about">אודות</a>
            <a routerLink="/terms">תנאי שימוש</a>
            <a routerLink="/privacy">פרטיות</a>
            <a routerLink="/refund-policy">מדיניות החזרים</a>
            <a routerLink="/accessibility">נגישות</a>
          </nav>
        </div>

        <p class="notice tt-alert tt-alert--warning">
          האתר נמצא בפיתוח ומריץ סימולציית תשלום בלבד. לא מתבצע חיוב אמיתי, לא נאספים פרטי אשראי,
          והקודים המוצגים הם קודי הדגמה.
        </p>

        <p class="tt-faint copy">© {{ year }} Top Token. כל הזכויות שמורות.</p>
      </div>
    </footer>
  `,
  styles: [`
    .foot { margin-block-start: var(--tt-space-8); border-block-start: 1px solid var(--tt-border); padding-block: var(--tt-space-6); background: var(--tt-surface); }
    .cols { display: grid; gap: var(--tt-space-5); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    nav { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    /* Footer links are a primary navigation path on mobile, so they get a
       comfortable target rather than the 22px a bare inline link would be. */
    nav a {
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      min-block-size: 32px;
      display: flex;
      align-items: center;
    }
    .col-title { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-sm); font-weight: 700; }
    .brand { display: block; margin-block-end: var(--tt-space-2); letter-spacing: 0.06em; }
    .notice { margin-block-start: var(--tt-space-5); }
    .copy { margin-block: var(--tt-space-4) 0; }
  `],
})
export class AppFooterComponent {
  readonly year = new Date().getFullYear();
}
