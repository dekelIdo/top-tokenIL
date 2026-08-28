import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { NotificationService } from '../../core/error';
import { localized } from '../../domain';
import { CustomerFacade } from '../../state';

/**
 * Account.
 *
 * Sign-in is a one-time link sent by email. There is no password field on this
 * page and there will not be one: the storefront must never be able to receive,
 * hold or transmit a credential.
 */
@Component({
  selector: 'tt-account-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow">
      <h1>האזור האישי</h1>

      <ng-container *ngIf="authState$ | async as state">
        <section class="tt-card tt-card--pad" *ngIf="state.kind === 'ANONYMOUS'">
          <h2>כניסה</h2>
          <p class="tt-muted">
            הזינו את כתובת האימייל שלכם ונשלח קישור כניסה חד-פעמי. אנחנו לא משתמשים בסיסמאות.
          </p>

          <form class="tt-field" (submit)="requestLink($event)">
            <label class="tt-label" for="account-email">אימייל</label>
            <input id="account-email" class="tt-input" type="email" name="email" [(ngModel)]="email" required
                   placeholder="you@example.com" />
            <button type="submit" class="tt-btn tt-btn--primary" [disabled]="sending()">
              שליחת קישור כניסה
            </button>
          </form>

          <p class="tt-alert" *ngIf="sent()">
            אם הכתובת קיימת במערכת, נשלח אליה קישור כניסה. כרגע האתר בפיתוח והכניסה עדיין אינה פעילה,
            ולכן לא יישלח מייל בפועל.
          </p>
        </section>

        <section class="tt-card tt-card--pad" *ngIf="state.kind === 'AUTHENTICATED'">
          <h2>שלום {{ state.customer.displayName || state.customer.email }}</h2>
          <button type="button" class="tt-btn tt-btn--ghost" (click)="signOut()">התנתקות</button>
        </section>
      </ng-container>

      <section class="tt-card tt-card--pad links">
        <h2>קיצורי דרך</h2>
        <a routerLink="/account/orders">ההזמנות שלי</a>
        <a routerLink="/support">פנייה לתמיכה</a>
        <a routerLink="/faq">שאלות נפוצות</a>
        <a routerLink="/refund-policy">מדיניות החזרים</a>
      </section>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 640px; }
    h1 { margin-block-end: var(--tt-space-5); }
    h2 { font-size: var(--tt-text-lg); }
    section { margin-block-end: var(--tt-space-4); }
    .tt-field { gap: var(--tt-space-3); }
    .links { display: flex; flex-direction: column; gap: var(--tt-space-2); align-items: flex-start; }
  `],
})
export class AccountPage {
  private readonly customer = inject(CustomerFacade);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  readonly authState$ = this.customer.authState$;
  readonly sending = signal(false);
  readonly sent = signal(false);
  email = '';

  constructor() {
    this.analytics.pageView('/account', 'Account');
  }

  requestLink(event: Event): void {
    event.preventDefault();
    if (!this.email.includes('@')) {
      return;
    }
    this.sending.set(true);
    this.customer.requestSignInLink(this.email).subscribe(() => {
      this.sending.set(false);
      this.sent.set(true);
    });
  }

  signOut(): void {
    this.customer.signOut().subscribe(() => {
      this.notifications.info(localized('התנתקתם.', 'You are signed out.'));
    });
  }
}
