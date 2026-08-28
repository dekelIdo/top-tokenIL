import { IsoDateTime, LocalizedText, Money, OrderId, PaymentIntentId } from '../common';

/**
 * Provider-agnostic payment surface. No provider SDK type, and no raw card data,
 * may ever appear in this file: card details are entered in a provider-hosted
 * field or redirect, so PAN/CVV never enter application memory.
 */
export enum PaymentProviderId {
  Mock = 'MOCK',
  IsraelCard = 'ISRAEL_CARD',
  Bit = 'BIT',
  PayPal = 'PAYPAL',
  ApplePay = 'APPLE_PAY',
  GooglePay = 'GOOGLE_PAY',
}

export interface PaymentProviderDescriptor {
  readonly id: PaymentProviderId;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly icon: string;
  /** False until a real integration ships. The UI must not offer disabled providers. */
  readonly enabled: boolean;
  /** True for the simulator, so the UI can label it unmistakably as a simulation. */
  readonly simulated: boolean;
}

export enum PaymentStatus {
  Created = 'CREATED',
  RequiresAction = 'REQUIRES_ACTION',
  Processing = 'PROCESSING',
  Succeeded = 'SUCCEEDED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

/** What the customer must do next. Never contains provider secrets. */
export type PaymentAction =
  | { readonly kind: 'REDIRECT'; readonly url: string }
  | { readonly kind: 'CONFIRM'; readonly prompt: LocalizedText }
  | { readonly kind: 'NONE' };

export interface PaymentIntent {
  readonly id: PaymentIntentId;
  readonly orderId: OrderId;
  readonly provider: PaymentProviderId;
  readonly amount: Money;
  readonly status: PaymentStatus;
  readonly action: PaymentAction;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /**
   * Opaque, non-secret handle issued by the provider for the client SDK.
   * Publishable keys only — secret keys stay on the backend, always.
   */
  readonly clientToken?: string;
}

/**
 * An opaque reference to a payment instrument, produced by the provider's own
 * hosted field, SDK or redirect — never by this application.
 *
 * SECURITY: `token` is the only thing that crosses this boundary. There is no
 * field here for a card number, expiry or CVV, and there must never be one: raw
 * card data must not enter the frontend's memory at all.
 */
export interface PaymentInstrumentRef {
  readonly token: string;
  readonly label?: LocalizedText;
}

/**
 * Test instruments, the way every real gateway exposes them (Stripe's 4242…,
 * Israel-Card's test PAN set). Offering them explicitly is what lets the failure
 * branches be exercised without pretending a decline "randomly" happened.
 */
export interface SimulatedInstrument extends PaymentInstrumentRef {
  readonly token: string;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
  readonly expectedStatus: PaymentStatus;
}

export interface PaymentSession {
  readonly intent: PaymentIntent;
  readonly availableProviders: readonly PaymentProviderDescriptor[];
  /**
   * Test instruments, present only when the selected provider is simulated. A
   * real provider returns an empty list — its instruments live in its own
   * hosted field, not in our payload.
   */
  readonly instruments?: readonly SimulatedInstrument[];
}

export interface PaymentResult {
  readonly intentId: PaymentIntentId;
  readonly status: PaymentStatus;
  readonly orderId: OrderId;
  /** Customer-safe reason. Never a gateway code or raw provider payload. */
  readonly failureReason?: LocalizedText;
}

export function isPaymentSettled(status: PaymentStatus): boolean {
  return status === PaymentStatus.Succeeded
    || status === PaymentStatus.Failed
    || status === PaymentStatus.Cancelled;
}
