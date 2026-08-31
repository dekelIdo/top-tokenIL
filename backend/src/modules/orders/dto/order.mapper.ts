import type { Fulfillment, Order, OrderItem, PaymentIntent } from '@prisma/client';

/**
 * Order rows to the wire shape the Angular mapper already parses.
 *
 * Two field names differ from the database on purpose, and this is the only
 * place that knows it: the column is `orderNumber` but the contract calls it
 * `reference`, and `displayVariant` is sent as `displayVariantName`. Renaming
 * either side to match would have meant changing a frozen frontend contract or
 * a schema that reads better as it is.
 */

type Money = { amountMinor: number; currency: string };

const money = (amountMinor: number, currency: string): Money => ({ amountMinor, currency });

export interface OrderResponse {
  id: string;
  reference: string;
  customerId: string | null;
  contactEmail: string;
  status: string;
  items: unknown[];
  totals: { subtotal: Money; discount: Money; total: Money };
  fulfillments: unknown[];
  payment: unknown | null;
  checkoutValues: Record<string, unknown>;
  couponCode: string | null;
  createdAt: string;
  updatedAt: string;
  statusMessage: unknown | null;
}

export type OrderWithRelations = Order & {
  items: OrderItem[];
  fulfillments: Fulfillment[];
  paymentIntents: PaymentIntent[];
};

function toItem(item: OrderItem, currency: string) {
  return {
    id: item.id,
    offerId: item.offerId,
    productId: item.productId,
    variantId: item.variantId,
    platformId: item.platformId,
    regionId: item.regionId,
    quantity: item.quantity,
    unitPrice: money(item.unitPriceMinor, currency),
    totalPrice: money(item.totalPriceMinor, currency),
    fulfillmentMethod: item.fulfillmentMethod,
    fulfillmentStatus: item.fulfillmentStatus,
    displayName: item.displayName,
    displayVariantName: item.displayVariant,
    imageUrl: item.imageUrl,
  };
}

/**
 * A delivered code is released only once the order is paid.
 *
 * The check is here, at the boundary, rather than only in the fulfillment
 * service: whatever route reaches this mapper, an unpaid order cannot leak the
 * thing the customer has not yet paid for.
 */
function toFulfillment(fulfillment: Fulfillment, orderIsPaid: boolean) {
  return {
    id: fulfillment.id,
    orderId: fulfillment.orderId,
    orderItemId: fulfillment.orderItemId,
    method: fulfillment.method,
    status: fulfillment.status,
    updatedAt: fulfillment.updatedAt.toISOString(),
    estimatedReadyAt: fulfillment.estimatedReadyAt?.toISOString() ?? null,
    /**
     * What the customer has to do for delivery to be possible.
     *
     * Released on the same condition as the delivery payload, and for the same
     * reason: it is part of what they bought. Unlike the payload it is shown
     * *before* delivery rather than after, because the customer performs the
     * listing and cannot do it without being told the exact price.
     *
     * It carries a card name and a number. There is no credential in it,
     * because none is ever collected.
     */
    instruction: orderIsPaid ? (fulfillment.customerInstruction ?? null) : null,
    delivery:
      orderIsPaid && fulfillment.deliveredAt
        ? {
            deliveredAt: fulfillment.deliveredAt.toISOString(),
            payload: fulfillment.deliveryPayload ?? { kind: 'NONE' },
          }
        : null,
    failureReason: fulfillment.failureReason,
  };
}

/** Statuses in which the customer has actually paid. */
const PAID_STATUSES = new Set([
  'PAID',
  'PROCESSING',
  'FULFILLMENT_PENDING',
  'FULFILLMENT_PROCESSING',
  'FULFILLED',
  'REFUND_PENDING',
  'REFUNDED',
]);

/**
 * The internal EXPIRED payment status has no member in the frontend domain.
 * Sending it would make the client fall back to PROCESSING and tell someone
 * their payment was still in flight, so it is reported as CANCELLED instead.
 */
function toWirePaymentStatus(status: string): string {
  return status === 'EXPIRED' ? 'CANCELLED' : status;
}

function toPayment(intent: PaymentIntent | undefined) {
  if (!intent) {
    return null;
  }
  return {
    id: intent.id,
    orderId: intent.orderId,
    provider: intent.provider,
    amount: money(intent.amountMinor, intent.currency),
    status: toWirePaymentStatus(intent.status),
    action: { kind: 'NONE' },
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

export function toOrderResponse(order: OrderWithRelations): OrderResponse {
  const paid = PAID_STATUSES.has(order.status);

  return {
    id: order.id,
    reference: order.orderNumber,
    customerId: order.customerId,
    contactEmail: order.contactEmail,
    status: order.status,
    items: order.items.map((item) => toItem(item, order.currency)),
    totals: {
      subtotal: money(order.subtotalMinor, order.currency),
      discount: money(order.discountMinor, order.currency),
      total: money(order.totalMinor, order.currency),
    },
    fulfillments: order.fulfillments.map((f) => toFulfillment(f, paid)),
    // The most recent intent is the one the customer is looking at.
    payment: toPayment(order.paymentIntents[0]),
    checkoutValues: (order.checkoutValues as Record<string, unknown>) ?? {},
    couponCode: order.couponCode,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    statusMessage: order.statusMessage,
  };
}

/** The smaller payload the order page polls every few seconds. */
export function toOrderStatusResponse(order: OrderWithRelations) {
  const paid = PAID_STATUSES.has(order.status);
  return {
    orderId: order.id,
    status: order.status,
    fulfillments: order.fulfillments.map((f) => toFulfillment(f, paid)),
    updatedAt: order.updatedAt.toISOString(),
    statusMessage: order.statusMessage,
  };
}
