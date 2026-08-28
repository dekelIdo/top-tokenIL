import { Cart } from '../cart';
import { CheckoutSessionId, IsoDateTime, LocalizedText, OrderId } from '../common';
import { PaymentProviderDescriptor } from '../payment';
import { CheckoutFieldValues, CheckoutRequirement } from './requirements';

export enum CheckoutStep {
  Details = 'DETAILS',
  Payment = 'PAYMENT',
  Confirmation = 'CONFIRMATION',
}

/**
 * A checkout session is created from a validated cart. Its `requirements` are the
 * union of the defaults and every requirement declared by the offers in the cart,
 * which is what makes checkout dynamic rather than one hard-coded form.
 */
export interface CheckoutSession {
  readonly id: CheckoutSessionId;
  readonly cart: Cart;
  readonly requirements: readonly CheckoutRequirement[];
  readonly availableProviders: readonly PaymentProviderDescriptor[];
  readonly step: CheckoutStep;
  readonly values: CheckoutFieldValues;
  readonly orderId?: OrderId;
  readonly expiresAt: IsoDateTime;
}

export interface CheckoutValidationIssue {
  readonly field: string;
  readonly message: LocalizedText;
}

export interface CheckoutSubmitResult {
  readonly session: CheckoutSession;
  readonly issues: readonly CheckoutValidationIssue[];
  readonly orderId?: OrderId;
}
