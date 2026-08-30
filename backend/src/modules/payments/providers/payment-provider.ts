/**
 * The payment provider boundary.
 *
 * Everything provider-specific lives behind this interface. The state machine
 * above it deals only in the vocabulary declared here, so attaching a real
 * Israeli acquirer later is a new implementation of this file rather than a
 * change to order creation, inventory or ownership.
 *
 * Two rules shape the shape of it:
 *
 * 1. No card data crosses this boundary, in either direction. A provider is
 *    handed an amount and an opaque instrument reference; it never receives a
 *    PAN, an expiry or a CVV, because those belong to the provider's own hosted
 *    form and must never reach our process.
 * 2. A provider never mutates an order. It reports what happened, and the state
 *    machine decides what that means. A provider that could write to the orders
 *    table would make "who marked this paid" unanswerable.
 */

export type ProviderPaymentStatus =
  | 'CREATED'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

/** What the customer has to do next, if anything. Never carries a secret. */
export type ProviderAction =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'REDIRECT'; readonly url: string }
  | { readonly kind: 'CONFIRM'; readonly prompt: { he: string; en: string } };

export interface ProviderIntent {
  /** The provider's own identifier for the payment. */
  readonly providerIntentId: string;
  readonly status: ProviderPaymentStatus;
  readonly action: ProviderAction;
  /**
   * A short-lived, public token the browser may use to talk to the provider's
   * hosted form. Never a secret key, and never persisted.
   */
  readonly clientToken?: string;
}

export interface ProviderResult {
  readonly providerIntentId: string;
  readonly status: ProviderPaymentStatus;
  /** A provider's own failure code, for diagnostics. Not shown to a customer. */
  readonly failureCode?: string;
}

/** A webhook the provider sent us, after its signature has been verified. */
export interface ProviderEvent {
  /** The provider's event id. Used to reject a replay. */
  readonly eventId: string;
  readonly type: string;
  readonly providerIntentId: string;
  readonly status: ProviderPaymentStatus;
  readonly failureCode?: string;
  /** When the provider says it sent this. Used to reject stale deliveries. */
  readonly occurredAt: Date;
  /** The payload with anything sensitive already removed, for the audit trail. */
  readonly redactedPayload: Record<string, unknown>;
}

export interface CreateIntentRequest {
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  /** Where the provider should send the customer back to. */
  readonly returnUrl?: string;
}

export interface PaymentProvider {
  readonly id: string;

  /** False until a real integration exists. The UI must not offer a disabled provider. */
  readonly enabled: boolean;

  /** True for a simulator, so the UI can label it unmistakably as one. */
  readonly simulated: boolean;

  createIntent(request: CreateIntentRequest): Promise<ProviderIntent>;

  /**
   * Asks the provider to charge the instrument.
   *
   * `instrumentToken` is opaque: for a real provider it is a token minted by its
   * hosted form, and for the sandbox it selects a scenario.
   */
  confirm(providerIntentId: string, instrumentToken: string): Promise<ProviderResult>;

  cancel(providerIntentId: string): Promise<ProviderResult>;

  /**
   * Verifies a webhook against the raw request body.
   *
   * The raw bytes matter: re-serialising parsed JSON changes key order and
   * whitespace, and the signature would no longer match what the provider
   * signed. Returns null when the signature is not valid, and the caller must
   * treat that as a rejection rather than a soft failure.
   */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): ProviderEvent | null;
}
