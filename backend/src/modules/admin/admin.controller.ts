import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '../../database/prisma.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { planCoinTrades } from '../fulfillment/coin-trade';
import { AdminAuthGuard } from './admin-auth.guard';
import {
  IssueTradeInstructionDto,
  MarkDeliveredDto,
  MarkFailedDto,
  QueueQueryDto,
} from './dto/admin.dto';

/**
 * The operator API.
 *
 * Every route is behind `AdminAuthGuard`, applied at the controller so a route
 * added later cannot be left unguarded by forgetting a decorator. There is no
 * public path here and no route that works without a token.
 *
 * These endpoints back the admin panel, but the panel is a client of them, not
 * the other way round: the same operations work from a script, which is what
 * makes them testable and what will let a supplier integration drive them
 * later without a browser in the loop.
 */
@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  /** Numbers for the dashboard: what is waiting, what is late, what came in today. */
  @Get('stats')
  async stats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [open, waitingOnCustomer, overdue, failed, deliveredToday, revenueToday] =
      await Promise.all([
        this.prisma.fulfillment.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
        this.prisma.fulfillment.count({ where: { status: 'WAITING_FOR_CUSTOMER' } }),
        this.prisma.fulfillment.count({
          where: {
            status: { in: ['PENDING', 'PROCESSING', 'WAITING_FOR_CUSTOMER'] },
            estimatedReadyAt: { lt: new Date() },
          },
        }),
        this.prisma.fulfillment.count({ where: { status: 'FAILED' } }),
        this.prisma.fulfillment.count({
          where: { status: 'DELIVERED', deliveredAt: { gte: startOfToday } },
        }),
        this.prisma.order.aggregate({
          where: {
            createdAt: { gte: startOfToday },
            status: { in: ['PAID', 'PROCESSING', 'FULFILLMENT_PENDING', 'FULFILLMENT_PROCESSING', 'FULFILLED'] },
          },
          _sum: { totalMinor: true },
        }),
      ]);

    return {
      open,
      waitingOnCustomer,
      overdue,
      failed,
      deliveredToday,
      // Minor units, like every other amount in this API. Formatting is the
      // client's job; a float here would be a rounding bug waiting to happen.
      revenueTodayMinor: revenueToday._sum.totalMinor ?? 0,
    };
  }

  /** The work queue, oldest first. */
  @Get('fulfillments')
  async queue(@Query() query: QueueQueryDto) {
    const { rows, total } = await this.fulfillment.queue({
      status: query.status,
      unclaimed: query.unclaimed,
      overdue: query.overdue,
      orderId: query.orderId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });

    return { items: rows, total, limit: query.limit ?? 50, offset: query.offset ?? 0 };
  }

  /** One job with its full event history, for working it or for answering a dispute. */
  @Get('fulfillments/:id')
  async detail(@Param('id') id: string) {
    return this.fulfillment.findOne(id);
  }

  @Post('fulfillments/:id/claim')
  @HttpCode(200)
  async claim(@Param('id') id: string, @Req() request: Request) {
    return this.fulfillment.claim(id, operatorOf(request));
  }

  @Post('fulfillments/:id/release')
  @HttpCode(200)
  async release(@Param('id') id: string, @Req() request: Request) {
    return this.fulfillment.release(id, operatorOf(request));
  }

  /**
   * Issues the "Buy the Player" instruction.
   *
   * Moves the job to `WAITING_FOR_CUSTOMER`: the customer now has to list the
   * card, and nothing can progress until they do.
   */
  @Post('fulfillments/:id/trade-instruction')
  @HttpCode(200)
  async issueTradeInstruction(
    @Param('id') id: string,
    @Body() body: IssueTradeInstructionDto,
    @Req() request: Request,
  ) {
    return this.fulfillment.issueTradeInstruction(
      id,
      { playerName: body.playerName, coins: body.coins, note: body.note },
      operatorOf(request),
    );
  }

  @Post('fulfillments/:id/deliver')
  @HttpCode(200)
  async deliver(
    @Param('id') id: string,
    @Body() body: MarkDeliveredDto,
    @Req() request: Request,
  ) {
    return this.fulfillment.markDelivered(
      id,
      body.payload as Prisma.InputJsonValue,
      operatorOf(request),
    );
  }

  @Post('fulfillments/:id/fail')
  @HttpCode(200)
  async fail(@Param('id') id: string, @Body() body: MarkFailedDto, @Req() request: Request) {
    return this.fulfillment.markFailed(
      id,
      { he: body.reason.he, en: body.reason.en },
      operatorOf(request),
    );
  }

  @Post('fulfillments/:id/retry')
  @HttpCode(200)
  async retry(@Param('id') id: string, @Req() request: Request) {
    return this.fulfillment.retry(id, operatorOf(request));
  }

  /**
   * Previews the listings for an amount without touching an order.
   *
   * Exists so an operator can answer "what would 2.5M look like" and so the
   * panel can show the plan before committing it. Pure calculation, no writes.
   */
  @Get('trade-preview')
  async tradePreview(@Query('coins') coins: string) {
    return planCoinTrades(Number.parseInt(coins, 10));
  }

  /** One order, everything on it, for support. */
  @Get('orders/:id')
  async order(@Param('id') id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { id: 'asc' } },
        fulfillments: { include: { events: { orderBy: { createdAt: 'asc' } } } },
        paymentIntents: { orderBy: { createdAt: 'desc' } },
      },
    });
  }
}

/**
 * The operator the guard resolved.
 *
 * The guard runs before every handler here and throws when it cannot identify
 * one, so this is never reached without an operator. The throw is a guard
 * against a future route that forgets `@UseGuards`, not an expected path.
 */
function operatorOf(request: Request): { name: string } {
  if (!request.operator) {
    throw new Error('admin route reached without an authenticated operator');
  }
  return request.operator;
}
