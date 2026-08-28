import { LocalizedText } from '../common';

/**
 * Checkout is not one fixed form. Each offer declares which fields its
 * fulfillment method genuinely needs, and the checkout UI renders exactly those.
 *
 * SECURITY: this enum deliberately contains no credential of any kind. There is
 * no PSN password, EA password, email password, 2FA seed or recovery code, and
 * none may ever be added — the storefront must never be able to ask for one.
 */
export enum CheckoutFieldKey {
  /** Where the code / receipt is sent. Required by every offer. */
  Email = 'EMAIL',
  FullName = 'FULL_NAME',
  Phone = 'PHONE',
  /** Explicit acknowledgement of the store region of a region-locked item. */
  RegionConfirmation = 'REGION_CONFIRMATION',
  /** Public account handle only, never a password. */
  PlatformAccountHandle = 'PLATFORM_ACCOUNT_HANDLE',
  /** Public in-game identifier used to locate the player for an in-game service. */
  GamePlayerId = 'GAME_PLAYER_ID',
  /** Which platform the service should be performed on. */
  PlatformSelection = 'PLATFORM_SELECTION',
  /** Free text for manual services (preferred delivery window, notes). */
  ServiceNote = 'SERVICE_NOTE',
  /** Mandatory terms acceptance. */
  TermsAcceptance = 'TERMS_ACCEPTANCE',
}

export type CheckoutFieldControl = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';

export interface CheckoutFieldOption {
  readonly value: string;
  readonly label: LocalizedText;
}

export interface CheckoutRequirement {
  readonly key: CheckoutFieldKey;
  readonly control: CheckoutFieldControl;
  readonly label: LocalizedText;
  readonly hint?: LocalizedText;
  readonly placeholder?: LocalizedText;
  readonly required: boolean;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly options?: readonly CheckoutFieldOption[];
}

/** Values collected for the requirements above. Strings and booleans only. */
export type CheckoutFieldValues = Partial<Record<CheckoutFieldKey, string | boolean>>;
