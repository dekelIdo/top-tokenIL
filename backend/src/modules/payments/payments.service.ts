import { Injectable } from '@nestjs/common';
import type { PaymentIntent, Prisma } from '@prisma/client';

import { conflictError, notFoundError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { OrderAccessService } from '../orders/order-access.service';
import { PaymentStateService } from './payment-state.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

import type { CustomerSession } from '@prisma/client';

/** Intent states that mean an attempt is still open. */
const LIVE = ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'] as const;

/**
 * Payment intents.
 *
 * Creating one is idempotent by construction rather than by a key: an order may
 * have at most one live intent, enforced by a partial unique index in
 * PostgreSQL, so a retry after a timeout finds the existing intent and returns
 * it. A settled payment is never replaced by a new live one, which is what stops
 * a paid order from acquiring a second chance to be charged.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessService,
    private readonly state: PaymentStateService,
    private readonly provider: SandboxPaymentProvider,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Opens a payment for a checkout's order, or returns the one already open.
   *
   * The amount is read from the order, never from the request. A client that
   * could name its own amount would make every other control pointless.
   */
  async createIntent(
    checkoutSessionId: string,
    session: CustomerSession | null,
  ): Promise<PaymentIntent> {
    const order = await this.prisma.order.findUnique({
      where: { checkoutSessionId },
      select: { id: true },
    });

    if (!order) {
      throw notFoundError(
        `No order exists for checkout ${checkoutSessionId}`,
        'ORDER_NOT_FOUND',
      );
    }

    // Same ownership rule as reading an order: someone else's is not found.
    const owned = await this.access.requireReadable(order.id, session);

    const existing = await this.prisma.paymentIntent.findFirst({
      where: { orderId: owned.id, status: { in: [...LIVE] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // A retry after a network timeout lands here and gets the same intent.
      return existing;
    }

    this.state.assertPayable(owned.status);

    const providerIntent = await this.provider.createIntent({
      orderId: owned.id,
      amountMinor: owned.totalMinor,
      currency: owned.currency,
    });

    try {
      return await this.prisma.paymentIntent.create({
        data: {
          id: generateId('pi'),
          orderId: owned.id,
          checkoutSessionId,
          provider: 'MOCK',
          providerIntentId: providerIntent.providerIntentId,
          amountMinor: owned.totalMinor,
          currency: owned.currency,
          status: 'CREATED',
        },
      });
    } catch (error) {
      // The partial unique index is the backstop: two simultaneous creations
      // race here and the loser is handed the winner's intent rather than an
      // error the customer cannot act on.
      if (this.isUniqueViolation(error)) {
        const winner = await this.prisma.paymentIntent.findFirst({
          where: { orderId: owned.id, status: { in: [...LIVE] } },
          orderBy: { createdAt: 'desc' },
        });
        if (winner) {
          this.logger.info('a concurrent payment intent creation was resolved to one intent', {
            orderId: owned.id,
          });
          return winner;
        }
      }
      throw error;
    }
  }

  /**
   * Loads an intent the caller owns.
   *
   * Not found rather than forbidden, matching orders and checkouts: an intent id
   * alone must reveal nothing.
   */
  async requireOwned(intentId: string, session: CustomerSession | null): Promise<PaymentIntent> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });

    if (!intent) {
      throw notFoundError(`Payment ${intentId} not found`, 'PAYMENT_NOT_FOUND');
    }

    // Throws a not-found of its own if the order is not the caller's.
    await this.access.requireReadable(intent.orderId, session);
    return intent;
  }

  /**
   * Asks the provider to charge, then applies whatever it says.
   *
   * The browser sends an instrument reference and nothing else. It cannot state
   * an outcome: the provider decides, and the state machine records.
   */
  async confirm(
    intentId: string,
    instrumentToken: string,
    session: CustomerSession | null,
  ): Promise<PaymentIntent> {
    const intent = await this.requireOwned(intentId, session);

    if (!(LIVE as readonly string[]).includes(intent.status)) {
      throw conflictError(
        `Payment ${intentId} has already settled`,
        'INTENT_NOT_CONFIRMABLE',
      );
    }

    const result = await this.provider.confirm(
      intent.providerIntentId ?? intent.id,
      instrumentToken,
    );

    await this.state.settle(intent.id, result.status, { failureCode: result.failureCode });

    return this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
  }

  async cancel(intentId: string, session: CustomerSession | null): Promise<PaymentIntent> {
    const intent = await this.requireOwned(intentId, session);

    if (!(LIVE as readonly string[]).includes(intent.status)) {
      // Cancelling something already settled is a no-op rather than an error:
      // the customer's intent has been honoured either way.
      return intent;
    }

    const result = await this.provider.cancel(intent.providerIntentId ?? intent.id);
    await this.state.settle(intent.id, result.status);

    return this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
    );
  }
}
