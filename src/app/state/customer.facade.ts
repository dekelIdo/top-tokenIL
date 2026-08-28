import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthState } from '../domain';
import { CustomerApiService } from '../data/api';

/**
 * Account state.
 *
 * There is no password in this flow and there never will be: sign-in is an emailed
 * one-time link handled by the backend. The frontend holds no credential, so
 * there is nothing here for `localStorage` to leak.
 */
@Injectable({ providedIn: 'root' })
export class CustomerFacade {
  private readonly api = inject(CustomerApiService);

  readonly authState$: Observable<AuthState> = this.api.getAuthState();

  requestSignInLink(email: string): Observable<void> {
    return this.api.requestEmailSignIn(email);
  }

  signOut(): Observable<void> {
    return this.api.signOut();
  }
}
