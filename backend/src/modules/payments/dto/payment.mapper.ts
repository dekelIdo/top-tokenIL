import type { PaymentIntent } from '@prisma/client';

import { SIMULATED_INSTRUMENTS } from '../simulated-instruments';

/**
 * Payment intents on the wire.
 *
 * `EXPIRED` is an internal state the frontend domain has no member for. It is
 * translated to `CANCELLED` here rather than sent as-is, because the Angular
 * mapper coerces an unknown status to a default and an expired payment would
 * otherwise render as something it is not.
 */
function toWireStatus(status: PaymentIntent['status']): string {
  return status === 'EXPIRED' ? 'CANCELLED' : status;
}

export function toPaymentIntentDto(intent: PaymentIntent) {
  return {
    id: intent.id,
    orderId: intent.orderId,
    provider: intent.provider,
    amount: { amountMinor: intent.amountMinor, currency: intent.currency },
    status: toWireStatus(intent.status),
    action:
      intent.status === 'CREATED' || intent.status === 'REQUIRES_ACTION'
        ? {
            kind: 'CONFIRM',
            prompt: {
              he: 'זוהי סימולציית תשלום לצורכי פיתוח. בחרו תרחיש ואשרו. לא יתבצע חיוב.',
              en: 'This is a development payment simulation. Pick a scenario and confirm. No charge is made.',
            },
          }
        : { kind: 'NONE' },
    // No client token is issued: the sandbox has no hosted form to talk to, and
    // inventing one would imply an integration that does not exist.
    clientToken: null,
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

/** The only provider available. Listing a disabled one would invite a dead end. */
export const PAYMENT_PROVIDERS = [
  {
    id: 'MOCK',
    name: { he: 'סימולציית תשלום', en: 'Payment simulation' },
    description: {
      he: 'סימולציה בלבד. לא מתבצע חיוב ולא נאספים פרטי אשראי.',
      en: 'Simulation only. No charge is made and no card details are collected.',
    },
    icon: null,
    enabled: true,
    simulated: true,
  },
];

export function toPaymentSessionDto(intent: PaymentIntent) {
  return {
    intent: toPaymentIntentDto(intent),
    availableProviders: PAYMENT_PROVIDERS,
    instruments: SIMULATED_INSTRUMENTS,
  };
}

export function toPaymentResultDto(intent: PaymentIntent) {
  return {
    intentId: intent.id,
    status: toWireStatus(intent.status),
    orderId: intent.orderId,
    failureReason: intent.failureCode
      ? failureMessage(intent.failureCode)
      : null,
  };
}

/**
 * Turns a provider failure code into something a customer can act on.
 *
 * An unrecognised code becomes a general message rather than being shown raw: a
 * provider's internal vocabulary is not customer-facing copy.
 */
function failureMessage(code: string): { he: string; en: string } {
  switch (code) {
    case 'issuer_declined':
      return {
        he: 'התשלום נדחה על ידי חברת האשראי. אפשר לנסות באמצעי תשלום אחר.',
        en: 'The payment was declined by the card issuer. You can try another payment method.',
      };
    case 'gateway_error':
      return {
        he: 'שירות התשלומים לא זמין כרגע. לא בוצע חיוב, אפשר לנסות שוב.',
        en: 'The payment service is unavailable right now. You were not charged. Please try again.',
      };
    default:
      return {
        he: 'התשלום לא הושלם. לא בוצע חיוב.',
        en: 'The payment was not completed. You were not charged.',
      };
  }
}
