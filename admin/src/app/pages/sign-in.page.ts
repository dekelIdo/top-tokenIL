import { Component, inject, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AdminApi } from '../api/admin-api.service';
import { TokenStore } from '../auth/token.store';

/**
 * Signing in.
 *
 * The token is verified by calling a real endpoint rather than accepted on
 * sight. Storing an unchecked token would send the operator to a dashboard that
 * fails on every request, and they would have no idea which of the two things
 * was wrong.
 */
@Component({
  selector: 'admin-sign-in',
  standalone: true,
  imports: [FormsModule, NgIf],
  template: `
    <div class="wrap">
      <form class="card" (ngSubmit)="submit()">
        <h1>פאנל תפעול</h1>
        <p class="muted">הזינו את טוקן האופרטור שלכם.</p>

        <label>
          טוקן
          <input
            type="password"
            name="token"
            autocomplete="off"
            [(ngModel)]="token"
            [disabled]="busy()"
            placeholder="מתחיל ומסתיים בלי רווחים"
          />
        </label>

        <p class="error" *ngIf="error() as message">{{ message }}</p>

        <button class="primary" type="submit" [disabled]="busy() || !token.trim()">
          {{ busy() ? 'בודק…' : 'כניסה' }}
        </button>

        <p class="muted note">
          הטוקן נשמר לכרטיסייה הזו בלבד ונמחק כשסוגרים אותה.
        </p>
      </form>
    </div>
  `,
  styles: [
    `
      .wrap {
        display: grid;
        place-items: center;
        min-height: 100dvh;
        padding: 1rem;
      }
      form {
        width: min(100%, 380px);
      }
      button {
        width: 100%;
      }
      .note {
        margin: 0.9rem 0 0;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class SignInPage {
  private readonly api = inject(AdminApi);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  token = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.busy() || !this.token.trim()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.tokens.signIn(this.token);

    this.api.stats().subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/']);
      },
      error: (error: Error) => {
        // A rejected token must not stay stored, or the next page load looks
        // signed in and fails everywhere.
        this.tokens.signOut();
        this.busy.set(false);
        this.error.set(error.message);
      },
    });
  }
}
