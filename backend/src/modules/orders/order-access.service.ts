import { Injectable } from '@nestjs/common';
import type { CustomerSession, Order } from '@prisma/client';

import { notFoundError } from '../../common/errors/api-error';
import { PrismaService } from '../../database/prisma.service';

/**
 * Who may read an order.
 *
 * An order belongs to whoever created it. For a signed-in customer that is the
 * customer; for someone who bought without an account it is the browser session
 * that placed the order. Both are recorded on the row, and either is sufficient.
 *
 * The rule lives in one service rather than being repeated in each controller,
 * so there is a single place to audit and a single place to change.
 */
@Injectable()
export class OrderAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads an order the caller is allowed to see, or throws.
   *
   * **Not found, never forbidden.** Answering 403 for someone else's order would
   * confirm that the id exists, which is exactly what an attacker walking ids
   * wants to learn. A stranger and a typo get the same answer.
   *
   * Order ids carry 128 bits of randomness, but that is defence in depth, not
   * the control. Knowing an id must never be enough on its own.
   */
  async requireReadable(orderId: string, session: CustomerSession | null): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order || !this.canRead(order, session)) {
      throw notFoundError(`Order ${orderId} not readable by this caller`, 'ORDER_NOT_FOUND');
    }

    return order;
  }

  /**
   * The ownership rule itself, separated so it can be tested directly and read
   * without a database in the way.
   */
  canRead(
    order: Pick<Order, 'customerId' | 'sessionId'>,
    session: CustomerSession | null,
  ): boolean {
    if (!session) {
      return false;
    }

    // A signed-in customer sees their own orders, including ones placed
    // anonymously before they signed in and later claimed.
    if (order.customerId !== null && session.customerId !== null) {
      return order.customerId === session.customerId;
    }

    // An anonymous order is readable only by the exact session that placed it.
    if (order.sessionId !== null) {
      return order.sessionId === session.id;
    }

    // An order with neither owner is unreachable rather than public. Reaching
    // this branch means an order was written without an owner, which is a bug
    // worth failing closed on.
    return false;
  }

  /**
   * Orders belonging to the caller.
   *
   * An anonymous session sees only what it placed itself, which is what makes
   * the account page work before anyone signs in.
   */
  async listForSession(
    session: CustomerSession | null,
    page: { skip: number; take: number },
  ): Promise<{ orders: Order[]; total: number }> {
    if (!session) {
      return { orders: [], total: 0 };
    }

    const where = session.customerId
      ? { customerId: session.customerId }
      : { sessionId: session.id };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  /**
   * Transfers anonymous orders from a session to the customer who just signed in.
   *
   * Someone who buys as a guest and then creates an account with the same
   * address should find that order in their history rather than losing it.
   * Only orders placed by this exact session move, so signing in cannot claim
   * anyone else's.
   */
  async claimSessionOrders(sessionId: string, customerId: string): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: { sessionId, customerId: null },
      data: { customerId },
    });
    return result.count;
  }
}
