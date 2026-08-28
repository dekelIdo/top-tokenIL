import { CustomerId, IsoDateTime, LocaleCode } from '../common';
import { RegionCode } from '../catalog/region';

/**
 * Customer profile. It holds contact and preference data only.
 *
 * SECURITY: no password, no password hash, no session token, no 2FA secret and no
 * gaming-account credential belongs in this model or anywhere in the frontend.
 * Authentication state is a short-lived token held in memory by the auth layer.
 */
export interface Customer {
  readonly id: CustomerId;
  readonly email: string;
  readonly displayName?: string;
  readonly phone?: string;
  readonly preferredLocale: LocaleCode;
  readonly preferredRegion: RegionCode;
  readonly createdAt: IsoDateTime;
  readonly emailVerified: boolean;
}

export type AuthState =
  | { readonly kind: 'ANONYMOUS' }
  | { readonly kind: 'AUTHENTICATED'; readonly customer: Customer };

export const ANONYMOUS: AuthState = { kind: 'ANONYMOUS' };
