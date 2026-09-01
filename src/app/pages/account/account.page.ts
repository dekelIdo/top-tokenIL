import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AnalyticsService } from '../../core/analytics';
import { environment } from '../../../environments/environment';
import { AuthMethods, CustomerApiService } from '../../data/api';
import { toAppError } from '../../domain';
import { IconComponent } from '../../ui';

type Mode = 'signIn' | 'register' | 'forgot';

/**
 * The account screen: sign in, register, or manage the account.
 *
 * One screen with a mode toggle rather than three routes and a wizard. The
 * audience arrives from a phone, often from a social link, and every extra step
 * between them and a purchase costs conversions. Google first for the people who
 * do not want another password, email and password underneath for those who do.
 *
 * The sign-in code from the earlier passwordless system is still here, one tap
 * away under "forgot", because accounts created under it have no password.
 */
@Component({
  selector: 'tt-account-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow">
      <ng-container *ngIf="authState$ | async as state">

        <!-- Signed out -->
        <ng-container *ngIf="state.kind === 'ANONYMOUS'">
          <header class="head">
            <h1>{{ mode() === 'register' ? 'פתיחת חשבון' : 'כניסה לחשבון' }}</h1>
            <p class="tt-muted">
              {{ mode() === 'register'
                ? 'חשבון שומר את ההזמנות שלכם ומאפשר לעקוב אחרי האספקה.'
                : 'כדי לראות את ההזמנות שלכם ואת סטטוס האספקה.' }}
            </p>
          </header>

          <div class="tt-card tt-card--pad panel">
            <p class="notice tt-alert tt-alert--warning" *ngIf="failedFromRedirect">
              הכניסה לא הושלמה. אפשר לנסות שוב.
            </p>

            <!-- Google, only when the server actually has credentials. -->
            <ng-container *ngIf="methods() as available">
              <a class="google" *ngIf="available.google" [href]="googleUrl">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6Z"/>
                  <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24Z"/>
                  <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3Z"/>
                  <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8Z"/>
                </svg>
                המשך עם Google
              </a>

              <div class="divider" *ngIf="available.google"><span>או</span></div>

              <!-- Development only. In production an unconfigured provider is
                   simply absent: showing customers a button that cannot work is
                   worse than not offering it. This note exists so the missing
                   configuration is obvious to whoever is running it locally. -->
              <p class="config-note" *ngIf="!available.google && showConfigHint">
                כניסה עם Google לא מוגדרת בסביבה הזו.
                <span class="config-note__keys">GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_REDIRECT_URI</span>
                <span class="config-note__doc">ההוראות המלאות נמצאות ב־docs/GOOGLE-OAUTH.md</span>
              </p>
            </ng-container>

            <form (submit)="submit($event)" novalidate>
              <!-- Asked for on signup only, and optional. One more field on a
                   phone is one more reason to abandon, so it never blocks. -->
              <label class="tt-field" *ngIf="mode() === 'register'">
                <span class="tt-label" for="acc-name">שם</span>
                <input id="acc-name" class="tt-input" type="text" name="name"
                       autocomplete="given-name" [(ngModel)]="displayName"
                       maxlength="80" placeholder="איך לפנות אליכם" />
              </label>

              <label class="tt-field">
                <span class="tt-label" for="acc-email">אימייל</span>
                <input id="acc-email" class="tt-input" type="email" name="email" autocomplete="email"
                       inputmode="email" [(ngModel)]="email" required placeholder="you@example.com" />
              </label>

              <label class="tt-field" *ngIf="mode() !== 'forgot'">
                <span class="tt-label" for="acc-password">סיסמה</span>
                <!-- A reveal control. Typing a password blind on a phone
                     keyboard is the most common reason a sign-in fails, and
                     hiding it protects nobody holding their own device. -->
                <span class="secret">
                  <input id="acc-password" class="tt-input" name="password"
                         [type]="revealed() ? 'text' : 'password'"
                         [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
                         [(ngModel)]="password" required minlength="8" placeholder="לפחות 8 תווים" />
                  <button type="button" class="secret__toggle" (click)="revealed.set(!revealed())"
                          [attr.aria-pressed]="revealed()"
                          [attr.aria-label]="revealed() ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'">
                    {{ revealed() ? 'הסתרה' : 'הצגה' }}
                  </button>
                </span>
                <span class="tt-hint" *ngIf="mode() === 'register'">לפחות 8 תווים.</span>
              </label>

              <p class="tt-alert tt-alert--danger" *ngIf="error()">{{ error() }}</p>
              <p class="tt-alert tt-alert--success" *ngIf="sent()">{{ sent() }}</p>

              <button type="submit" class="tt-btn tt-btn--primary tt-btn--block" [disabled]="busy()">
                {{ busy() ? 'רגע…' : submitLabel }}
              </button>
            </form>

            <div class="switch">
              <button type="button" class="link" *ngIf="mode() !== 'register'" (click)="setMode('register')">
                אין לכם חשבון? פתחו חשבון
              </button>
              <button type="button" class="link" *ngIf="mode() !== 'signIn'" (click)="setMode('signIn')">
                כבר יש לכם חשבון? התחברו
              </button>
              <button type="button" class="link" *ngIf="mode() === 'signIn'" (click)="setMode('forgot')">
                שכחתי סיסמה
              </button>
            </div>
          </div>

          <!-- The order page already says this about orders; sign-in needed it
               too. Without it a customer signs in, refreshes, finds themselves
               signed out and concludes the site is broken. -->
          <p class="notice tt-alert tt-alert--warning" *ngIf="sessionIsTemporary">
            האתר בפיתוח וההתחברות נשמרת בזיכרון הדפדפן בלבד, ולכן רענון הדף מנתק אתכם.
            בגרסה עם שרת ההתחברות תישמר.
          </p>

          <p class="fine tt-faint">
            אנחנו לא מבקשים סיסמה של חשבון המשחק, קוד אימות או קודי גיבוי. לעולם.
          </p>
        </ng-container>

        <!-- Signed in -->
        <ng-container *ngIf="state.kind === 'AUTHENTICATED'">
          <header class="head">
            <!-- A greeting, not a record header. The page opened with the
                 customer's own email address set as a title, which is how an
                 admin console addresses a row in a table. -->
            <h1>שלום{{ state.customer.displayName ? ', ' + state.customer.displayName : '' }}</h1>
            <p class="tt-muted">{{ state.customer.email }}</p>
          </header>

          <nav class="tiles">
            <a class="tile" routerLink="/account/orders">
              <tt-icon name="box" [size]="20"></tt-icon>
              <span>
                <strong>ההזמנות שלי</strong>
                <span class="tt-faint">סטטוס תשלום ואספקה</span>
              </span>
              <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
            </a>

            <a class="tile" routerLink="/support">
              <tt-icon name="shield" [size]="20"></tt-icon>
              <span>
                <strong>תמיכה</strong>
                <span class="tt-faint">שאלה על הזמנה או על מוצר</span>
              </span>
              <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
            </a>
          </nav>

          <section class="tt-card tt-card--pad">
            <h2>אבטחה</h2>
            <p class="tt-muted small">
              שינוי סיסמה מנתק את כל המכשירים המחוברים.
            </p>
            <a class="tt-btn tt-btn--ghost" routerLink="/support">שינוי סיסמה</a>
          </section>

          <section class="tt-card tt-card--pad">
            <h2>פרטיות</h2>
            <p class="tt-muted small">
              אפשר לבקש מחיקה של החשבון. הזמנות שבוצעו נשמרות כרשומה חשבונאית,
              ולכן המחיקה מטופלת ידנית ולא מוחקת אותן אוטומטית.
            </p>
            <div class="tt-row">
              <a class="tt-btn tt-btn--ghost" routerLink="/privacy">מדיניות הפרטיות</a>
              <button type="button" class="tt-btn tt-btn--quiet danger" (click)="requestDeletion()">
                בקשת מחיקת חשבון
              </button>
            </div>
          </section>

          <button type="button" class="tt-btn tt-btn--ghost" (click)="signOut()">התנתקות</button>
        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 520px; }
    .head { margin-block-end: var(--tt-space-5); }
    .head h1 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-2xl); }
    .head p { margin: 0; }

    .panel { display: flex; flex-direction: column; gap: var(--tt-space-4); }

    .google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--tt-space-2);
      /* A comfortable thumb target; this is the primary route for most people. */
      min-block-size: 48px;
      border-radius: var(--tt-radius-md);
      background: #ffffff;
      color: #1f1f1f;
      font-weight: 600;
      text-decoration: none;
    }
    .google:hover { text-decoration: none; filter: brightness(0.96); }

    .secret { position: relative; display: block; }
    .secret .tt-input { inline-size: 100%; padding-inline-end: 4.2rem; }
    .secret__toggle {
      position: absolute;
      inset-inline-end: var(--tt-space-2);
      inset-block-start: 50%;
      transform: translateY(-50%);
      min-block-size: 32px;
      padding-inline: var(--tt-space-2);
      border: 0;
      border-radius: var(--tt-radius-sm);
      background: transparent;
      color: var(--tt-text-muted);
      font: inherit;
      font-size: var(--tt-text-xs);
      font-weight: 600;
      cursor: pointer;
    }
    .secret__toggle:hover { color: var(--tt-text); background: var(--tt-surface-3); }

    .config-note {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin: 0 0 var(--tt-space-4);
      padding: var(--tt-space-3);
      border: 1px dashed var(--tt-border-strong);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }
    .config-note__keys {
      font-family: var(--tt-font-numeric);
      color: var(--tt-text-faint);
      direction: ltr;
      unicode-bidi: isolate;
      text-align: start;
    }
    .config-note__doc { color: var(--tt-text-faint); }

    .divider {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      block-size: 1px;
      background: var(--tt-border);
    }

    form { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .tt-field { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .tt-hint { color: var(--tt-text-faint); font-size: var(--tt-text-xs); }

    .switch { display: flex; flex-direction: column; gap: var(--tt-space-2); align-items: flex-start; }
    .link {
      background: none;
      border: 0;
      padding: 0;
      color: var(--tt-brand-300);
      font: inherit;
      font-size: var(--tt-text-sm);
      cursor: pointer;
      text-align: start;
    }
    .link:hover { text-decoration: underline; }

    .fine { margin-block-start: var(--tt-space-4); text-align: center; }

    .tiles { display: flex; flex-direction: column; gap: var(--tt-space-2); margin-block-end: var(--tt-space-5); }
    .tile {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      min-block-size: 64px;
      padding-inline: var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      color: inherit;
    }
    .tile:hover { border-color: var(--tt-border-strong); text-decoration: none; }
    .tile > span { display: flex; flex-direction: column; flex: 1; }
    .tile strong { font-size: var(--tt-text-sm); }
    .tile tt-icon:first-child { color: var(--tt-brand-400); }

    section { margin-block-end: var(--tt-space-4); }
    section h2 { margin: 0 0 var(--tt-space-2); font-size: var(--tt-text-lg); }
    .small { font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .danger { color: var(--tt-danger); }
  `],
})
export class AccountPage {
  private readonly customerApi = inject(CustomerApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);

  readonly authState$ = this.customerApi.getAuthState();
  readonly methods = signal<AuthMethods | null>(null);

  readonly mode = signal<Mode>('signIn');
  readonly busy = signal(false);
  /** Optional, and only collected when opening an account. */
  displayName = '';

  /** Whether the password field is showing its value. */
  readonly revealed = signal(false);

  readonly error = signal<string | null>(null);
  readonly sent = signal<string | null>(null);

  email = '';
  password = '';

  /** Set when Google bounced the customer back here after a failure. */
  readonly failedFromRedirect = this.route.snapshot.queryParamMap.get('auth') === 'failed';

  /**
   * A full page navigation, not an XHR. The backend owns the redirect to Google
   * and sets the session cookie on the way back, so the browser has to leave.
   */
  readonly googleUrl = `${environment.apiBaseUrl}/${environment.apiVersion}/auth/google?returnTo=/account`;

  /**
   * Whether to explain a missing Google configuration on screen.
   *
   * Development and staging only. A customer on the live site should never be
   * told which environment variables the operator forgot to set.
   */
  readonly showConfigHint = !environment.production;

  /**
   * Whether a sign-in survives a reload.
   *
   * Keyed on the data mode, not on the production flag: the public build is a
   * production build running against the in-memory mock, so gating this on
   * `production` would hide the warning on the one site that needs it.
   */
  readonly sessionIsTemporary = environment.apiMode === 'mock';

  constructor() {
    this.analytics.pageView('/account', 'Account');
    this.customerApi
      .getAuthMethods()
      .pipe(catchError(() => of({ password: true, google: false, emailCode: true } as AuthMethods)))
      .subscribe((methods) => this.methods.set(methods));
  }

  get submitLabel(): string {
    if (this.mode() === 'register') {
      return 'פתיחת חשבון';
    }
    return this.mode() === 'forgot' ? 'שליחת קישור איפוס' : 'כניסה';
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.sent.set(null);
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }

    this.error.set(null);
    this.sent.set(null);
    this.busy.set(true);

    const done = () => this.busy.set(false);
    const fail = (cause: unknown) => {
      this.busy.set(false);
      this.error.set(toAppError(cause).userMessage.he);
    };

    if (this.mode() === 'forgot') {
      this.customerApi.requestPasswordReset(this.email).subscribe({
        next: () => {
          done();
          // Says nothing about whether the address exists.
          this.sent.set('אם הכתובת רשומה אצלנו, נשלח אליה קישור לאיפוס הסיסמה.');
        },
        error: fail,
      });
      return;
    }

    if (this.mode() === 'register') {
      this.customerApi.register(this.email, this.password, this.displayName).subscribe({
        next: () => {
          done();
          this.password = '';
          this.sent.set('החשבון נפתח. אפשר להמשיך לקנות.');
        },
        error: fail,
      });
      return;
    }

    this.customerApi.login(this.email, this.password).subscribe({
      next: () => {
        done();
        // Cleared the moment it is no longer needed; it is never stored.
        this.password = '';
      },
      error: fail,
    });
  }

  requestDeletion(): void {
    if (!confirm('לשלוח בקשה למחיקת החשבון? תנותקו מכל המכשירים.')) {
      return;
    }
    this.customerApi.requestAccountDeletion().subscribe({
      error: (cause: unknown) => this.error.set(toAppError(cause).userMessage.he),
    });
  }

  signOut(): void {
    this.customerApi.signOut().subscribe();
  }
}
