import { Observable } from 'rxjs';
import { AuthState, Customer } from '../../domain';

/**
 * SECURITY: there is intentionally no `login(password)` method. When real
 * authentication ships it will be an email one-time code or a backend-driven
 * OAuth redirect; the frontend must never receive, hold or transmit a password.
 */
export abstract class CustomerApiService {
  abstract getAuthState(): Observable<AuthState>;
  abstract requestEmailSignIn(email: string): Observable<void>;
  abstract updateProfile(patch: Partial<Pick<Customer, 'displayName' | 'phone' | 'preferredLocale' | 'preferredRegion'>>): Observable<Customer>;
  abstract signOut(): Observable<void>;
}
