import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../../database/prisma.service';
import { SessionService } from '../customers/session.service';
import { OrderAccessService } from './order-access.service';
import {
  OrderWithRelations,
  toOrderResponse,
  toOrderStatusResponse,
} from './dto/order.mapper';

/** Everything an order response needs, loaded in one query. */
const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  fulfillments: { orderBy: { id: 'asc' } },
  paymentIntents: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

/**
 * Reading orders.
 *
 * Order creation belongs to a later phase; these endpoints exist now because
 * ownership is the security property worth getting right first, and it can only
 * be tested against a real endpoint.
 */
@Controller()
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly access: OrderAccessService,
  ) {}

  @Get('orders/:orderId')
  async getOrder(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    // Throws a not-found for someone else's order, never a forbidden.
    await this.access.requireReadable(orderId, session);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderResponse(order as OrderWithRelations);
  }

  @Get('orders/:orderId/status')
  async getOrderStatus(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    await this.access.requireReadable(orderId, session);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderStatusResponse(order as OrderWithRelations);
  }

  /**
   * The caller's own orders.
   *
   * Anonymous sessions get the orders they placed, so a guest can see their
   * history without an account. No session means an empty page rather than an
   * error: having bought nothing is not a failure.
   */
  @Get('account/orders')
  async listOrders(
    @Req() request: Request,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam) || 20));

    const session = await this.sessions.resolve(request);
    const { total } = await this.access.listForSession(session, {
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const where = session
      ? session.customerId
        ? { customerId: session.customerId }
        : { sessionId: session.id }
      : { id: '__none__' };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ORDER_INCLUDE,
    });

    return {
      items: orders.map((order) => toOrderResponse(order as OrderWithRelations)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }
}
