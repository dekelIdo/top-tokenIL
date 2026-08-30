import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { generateId } from '../../common/crypto/tokens';
import { PrismaService } from '../../database/prisma.service';
import { SessionService } from '../customers/session.service';
import { FULFILLMENT_DESCRIPTORS } from './fulfillment-descriptors';

/** Mirrors the `SupportTopic` enum. An unlisted topic is rejected, not stored. */
const SUPPORT_TOPICS = [
  'ORDER_STATUS',
  'DELIVERY_PROBLEM',
  'PAYMENT_PROBLEM',
  'REFUND_REQUEST',
  'REGION_PROBLEM',
  'GENERAL',
] as const;

export class CreateSupportTicketDto {
  @IsIn(SUPPORT_TOPICS, { message: 'topic must be a known support topic' })
  topic!: string;

  @IsEmail({}, { message: 'contactEmail must be a valid address' })
  @MaxLength(254)
  contactEmail!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;
}

function localized(value: unknown): { he: string; en?: string | null } {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['he'] === 'string') {
      return {
        he: record['he'],
        en: typeof record['en'] === 'string' ? record['en'] : null,
      };
    }
  }
  return { he: '' };
}

/**
 * Promotions, reviews, FAQ and support.
 *
 * These sit beside the catalog rather than inside it: they describe the shop
 * rather than what it sells, but the storefront cannot render a page without
 * them.
 *
 * Nothing here invents social proof. Review counts and averages are computed
 * from published review rows, so a product with no reviews reports none rather
 * than a flattering default.
 */
@Controller()
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /** Live promotions only. A campaign that has not started is not advertised. */
  @Get('promotions')
  async listPromotions() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: 'desc' },
      take: 20,
    });

    return promotions.map((promotion) => ({
      id: promotion.id,
      slug: promotion.slug,
      kind: promotion.kind,
      title: localized(promotion.title),
      description: localized(promotion.description),
      bannerImageUrl: promotion.bannerImageUrl,
      percentOff: promotion.percentOff,
      amountOff:
        promotion.amountOffMinor !== null
          ? { amountMinor: promotion.amountOffMinor, currency: promotion.currency ?? 'ILS' }
          : null,
      gameIds: promotion.gameIds,
      productIds: promotion.productIds,
      startsAt: promotion.startsAt.toISOString(),
      endsAt: promotion.endsAt?.toISOString() ?? null,
      active: promotion.active,
    }));
  }

  @Get('reviews')
  async listReviews(
    @Query('productId') productId?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam) || 10));
    const where = { published: true, ...(productId ? { productId } : {}) };

    const [total, reviews] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: reviews.map((review) => ({
        id: review.id,
        productId: review.productId,
        authorDisplayName: review.authorDisplayName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt.toISOString(),
        // Never asserted unless an order actually backs it.
        verifiedPurchase: review.verifiedPurchase,
      })),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * Rating summary, computed rather than stored.
   *
   * The denormalised columns were removed in Phase B precisely so this number
   * cannot drift away from the rows it claims to summarise.
   */
  @Get('reviews/summary')
  async reviewSummary(@Query('productId') productId?: string) {
    const where = { published: true, ...(productId ? { productId } : {}) };

    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { rating: true },
    });

    const distribution = [0, 0, 0, 0, 0];
    let count = 0;
    let sum = 0;

    for (const row of grouped) {
      const index = Math.min(5, Math.max(1, row.rating)) - 1;
      distribution[index] += row._count.rating;
      count += row._count.rating;
      sum += row.rating * row._count.rating;
    }

    return {
      // No reviews means no average. Zero is honest; a default of five is not.
      average: count > 0 ? Number((sum / count).toFixed(2)) : 0,
      count,
      distribution,
    };
  }

  @Get('faq')
  async listFaq() {
    const entries = await this.prisma.faqEntry.findMany({ orderBy: { sortOrder: 'asc' } });
    return entries.map((entry) => ({
      id: entry.id,
      topic: entry.topic,
      question: localized(entry.question),
      answer: localized(entry.answer),
    }));
  }

  /**
   * How each delivery method behaves.
   *
   * Static because these describe our own process rather than data: what the
   * method is called, roughly how long it takes and whether a person is
   * involved. The estimates are ranges, not promises of instant delivery.
   */
  @Get('fulfillment/descriptors')
  listFulfillmentDescriptors() {
    return FULFILLMENT_DESCRIPTORS;
  }

  @Get('fulfillment/descriptors/:method')
  getFulfillmentDescriptor(@Param('method') method: string) {
    return (
      FULFILLMENT_DESCRIPTORS.find((descriptor) => descriptor.method === method) ??
      FULFILLMENT_DESCRIPTORS.find((descriptor) => descriptor.method === 'NOT_SUPPORTED')
    );
  }

  /**
   * Opens a support ticket.
   *
   * Attached to the caller's session when there is one, so a customer can be
   * recognised later without being asked to prove anything here.
   */
  @Post('support/tickets')
  @HttpCode(HttpStatus.CREATED)
  async createTicket(
    @Body() body: CreateSupportTicketDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.sessions.ensure(request, response);

    const reference = `TS-${Date.now().toString(36).toUpperCase()}`;
    const ticket = await this.prisma.supportTicket.create({
      data: {
        id: generateId('tkt'),
        reference,
        customerId: session.customerId,
        // An order id is recorded only when the caller may actually read that
        // order, so a ticket cannot be used to assert ownership of someone
        // else's purchase.
        orderId: await this.ownedOrderId(body.orderId, session.customerId, session.id),
        topic: body.topic as never,
        contactEmail: body.contactEmail,
        subject: body.subject,
        message: body.message,
      },
    });

    return {
      id: ticket.id,
      reference: ticket.reference,
      topic: ticket.topic,
      status: ticket.status,
      orderId: ticket.orderId,
      contactEmail: ticket.contactEmail,
      subject: ticket.subject,
      message: ticket.message,
      createdAt: ticket.createdAt.toISOString(),
    };
  }

  private async ownedOrderId(
    orderId: string | undefined,
    customerId: string | null,
    sessionId: string,
  ): Promise<string | null> {
    if (!orderId) {
      return null;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, sessionId: true },
    });

    if (!order) {
      return null;
    }

    const owned =
      (customerId !== null && order.customerId === customerId) || order.sessionId === sessionId;

    return owned ? order.id : null;
  }
}
