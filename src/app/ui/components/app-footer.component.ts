import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BRAND } from '../../core/brand';
import { BrandLogoComponent } from './brand-logo.component';

/**
 * Footer.
 *
 * Grouped by what a customer came looking for rather than dumped into one long
 * column: what we sell, how to get help, who we are, and the legal pages an
 * Israeli consumer store has to publish. The eight-link "information" column it
 * replaced was a sitemap, and a sitemap is what a footer looks like when nobody
 * decided what belongs in it.
 *
 * The reviews link is gone. It pointed at a page with nothing on it, because
 * the shop has no real reviews and will not carry invented ones.
 *
 * It also states plainly that the site is in development and runs a payment
 * simulation. The storefront never implies a live integration it lacks.
 */
@Component({
  selector: 'tt-app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, BrandLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="foot">
      <div class="tt-container">
        <div class="cols">
          <div class="about">
            <tt-brand-logo></tt-brand-logo>
            <p class="tt-faint">{{ description }}</p>
          </div>
          <nav>
            <h2 class="col-title">חנות</h2>
            <a routerLink="/store">כל החבילות</a>
            <a routerLink="/deals">מבצעים</a>
          </nav>
          <nav>
            <h2 class="col-title">שירות</h2>
            <a routerLink="/support">תמיכה</a>
            <a routerLink="/faq">שאלות נפוצות</a>
            <a routerLink="/contact">צור קשר</a>
            <a routerLink="/account/orders">ההזמנות שלי</a>
          </nav>
          <nav>
            <h2 class="col-title">העסק</h2>
            <a routerLink="/about">אודות</a>
            <a routerLink="/business-details">פרטי העסק</a>
            <a routerLink="/delivery">אספקה</a>
          </nav>
          <nav>
            <h2 class="col-title">משפטי</h2>
            <a routerLink="/terms">תנאי שימוש</a>
            <a routerLink="/privacy">פרטיות</a>
            <a routerLink="/refund-policy">ביטול והחזרים</a>
            <a routerLink="/accessibility">נגישות</a>
            <a routerLink="/ip">סימני מסחר</a>
          </nav>
        </div>

        <p class="notice tt-alert tt-alert--warning">
          האתר נמצא בפיתוח ומריץ סימולציית תשלום בלבד. לא מתבצע חיוב אמיתי, לא נאספים פרטי אשראי,
          והקודים המוצגים הם קודי הדגמה.
        </p>

        <p class="tt-faint copy">© {{ year }} {{ brandName }}. כל הזכויות שמורות.</p>
      </div>
    </footer>
  `,
  styles: [`
    .foot { margin-block-start: var(--tt-space-8); border-block-start: 1px solid var(--tt-border); padding-block: var(--tt-space-6); background: var(--tt-surface); }
    /* Two columns on a phone rather than one. At minmax(180px) the link groups
       collapsed to a single column and the footer ran for most of a screen,
       which on a page we are trying to shorten is a lot of height spent on
       navigation nobody scrolled down for. */
    .cols {
      display: grid;
      gap: var(--tt-space-5) var(--tt-space-4);
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @media (min-width: 720px) {
      .cols { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    }
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
    .about tt-brand-logo { margin-block-end: var(--tt-space-2); }
    .brand { display: block; margin-block-end: var(--tt-space-2); letter-spacing: 0.06em; }
    .notice { margin-block-start: var(--tt-space-5); }
    .copy { margin-block: var(--tt-space-4) 0; }
  `],
})
export class AppFooterComponent {
  readonly year = new Date().getFullYear();
  readonly brandName = BRAND.name;
  readonly description = BRAND.description.he;
}
