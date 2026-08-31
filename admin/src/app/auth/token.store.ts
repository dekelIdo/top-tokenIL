import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'zuz.operator.token';

/**
 * Where the operator's token lives while they work.
 *
 * `sessionStorage`, not `localStorage`, and the difference matters: session
 * storage is scoped to the tab and cleared when it closes, so a token does not
 * outlive the shift on a shared or forgotten machine. It survives a page
 * refresh, which is the only persistence an operator actually needs.
 *
 * The token is a bearer credential that authorises marking orders delivered and
 * reading every customer's contact details. It is never written to a cookie
 * (nothing here needs to be sent automatically) and never to a URL.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly current = signal<string | null>(read());

  readonly token = this.current.asReadonly();

  signIn(token: string): void {
    const trimmed = token.trim();
    this.current.set(trimmed);

    try {
      sessionStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Private browsing, or storage disabled. The token still works for this
      // page view; it just will not survive a refresh.
    }
  }

  signOut(): void {
    this.current.set(null);

    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  isSignedIn(): boolean {
    return (this.current() ?? '').length > 0;
  }
}

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
