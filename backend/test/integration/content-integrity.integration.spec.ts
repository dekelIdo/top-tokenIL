import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';

/**
 * The endpoints that describe the shop rather than what it sells.
 *
 * These are the ones most likely to drift into invention, because flattering
 * numbers are easy to produce and nobody complains about them. Every assertion
 * here checks that a claim shown to a customer is backed by a row.
 */
describe('content integrity', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    app = await createApp();
    await app.init();
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

  // -------------------------------------------------------------------------
  describe('reviews are counted, not claimed', () => {
    it('reports an average computed from the rows behind it', async () => {
      const summary = await get('/reviews/summary').expect(200);

      const rows = await prisma.review.findMany({ where: { published: true } });
      const expected =
        rows.length > 0
          ? Number((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length).toFixed(2))
          : 0;

      expect(summary.body.count).toBe(rows.length);
      expect(summary.body.average).toBeCloseTo(expected, 2);
    });

    it('reports no rating at all for a product nobody has reviewed', async () => {
      const summary = await get('/reviews/summary?productId=prod_nobody_reviewed').expect(200);

      // Zero, not a flattering default. An unreviewed product must not arrive
      // with five stars.
      expect(summary.body.count).toBe(0);
      expect(summary.body.average).toBe(0);
    });

    it('never marks a review as a verified purchase without an order behind it', async () => {
      const response = await get('/reviews?pageSize=50').expect(200);

      for (const review of response.body.items) {
        if (review.verifiedPurchase === true) {
          const orders = await prisma.order.count({
            where: { customerId: { not: null }, items: { some: { productId: review.productId } } },
          });
          expect(orders).toBeGreaterThan(0);
        }
      }
    });

    it('serves the demo reviews as unverified, because no order backs them', async () => {
      const response = await get('/reviews?pageSize=50').expect(200);
      expect(response.body.items.every((review: { verifiedPurchase: boolean }) => review.verifiedPurchase === false))
        .toBe(true);
    });

    it('bounds the page size', async () => {
      const response = await get('/reviews?pageSize=10000').expect(200);
      expect(response.body.pageSize).toBeLessThanOrEqual(50);
    });
  });

  // -------------------------------------------------------------------------
  describe('promotions are live or absent', () => {
    it('never advertises a promotion that has not started or has ended', async () => {
      const response = await get('/promotions').expect(200);
      const now = Date.now();

      for (const promotion of response.body) {
        expect(new Date(promotion.startsAt).getTime()).toBeLessThanOrEqual(now);
        if (promotion.endsAt) {
          expect(new Date(promotion.endsAt).getTime()).toBeGreaterThan(now);
        }
        expect(promotion.active).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('delivery is described honestly', () => {
    it('covers every fulfillment method the catalog actually uses', async () => {
      const descriptors = await get('/fulfillment/descriptors').expect(200);
      const described = new Set(descriptors.body.map((d: { method: string }) => d.method));

      const used = await prisma.offer.findMany({
        where: { active: true },
        select: { fulfillmentMethod: true },
        distinct: ['fulfillmentMethod'],
      });

      for (const offer of used) {
        expect(described.has(offer.fulfillmentMethod)).toBe(true);
      }
    });

    it('promises no instant delivery and no guarantee', async () => {
      const descriptors = await get('/fulfillment/descriptors').expect(200);
      const text = JSON.stringify(descriptors.body);

      // "מיידית" (instant) and guarantee language are exactly the claims we
      // cannot support: delivery depends on stock and, for some methods, on a
      // person being available.
      expect(text).not.toMatch(/מיידית|instant/i);
      expect(text).not.toMatch(/מובטח|guaranteed|100%/i);
    });

    it('says plainly that an in-game service never asks for a password', async () => {
      const descriptors = await get('/fulfillment/descriptors').expect(200);
      const inGame = descriptors.body.find((d: { method: string }) => d.method === 'IN_GAME_SERVICE');

      expect(inGame.description.he).toContain('לעולם לא נבקש סיסמה');
    });

    it('describes an unsupported method as unbuyable rather than omitting it', async () => {
      const response = await get('/fulfillment/descriptors/NOT_SUPPORTED').expect(200);
      expect(response.body.method).toBe('NOT_SUPPORTED');
    });

    it('falls back to the unsupported descriptor for a method it does not know', async () => {
      const response = await get('/fulfillment/descriptors/INVENTED_METHOD').expect(200);
      // Failing toward "cannot be bought" rather than inventing a delivery promise.
      expect(response.body.method).toBe('NOT_SUPPORTED');
    });
  });

  // -------------------------------------------------------------------------
  describe('support', () => {
    it('serves the FAQ', async () => {
      const response = await get('/faq').expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].question.he.length).toBeGreaterThan(0);
    });

    it('opens a ticket and gives back a reference', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .send({
          topic: 'ORDER_STATUS',
          contactEmail: 'buyer@example.com',
          subject: 'Question about my order',
          message: 'I would like to ask about the delivery time for my order.',
        })
        .expect(201);

      expect(response.body.reference).toMatch(/^TS-/);
      expect(response.body.status).toBe('OPEN');
    });

    it('rejects an unknown topic rather than storing it', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .send({
          topic: 'DROP_TABLE',
          contactEmail: 'buyer@example.com',
          subject: 'Subject here',
          message: 'A message long enough to pass validation.',
        })
        .expect(422);
    });

    it('refuses to attach a ticket to an order the caller does not own', async () => {
      const foreign = await prisma.order.findFirst({ where: { customerId: { not: null } } });
      if (!foreign) {
        return;
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .send({
          topic: 'ORDER_STATUS',
          contactEmail: 'stranger@example.com',
          subject: 'About that order',
          message: 'Asking about an order that is not mine at all.',
          orderId: foreign.id,
        })
        .expect(201);

      // The ticket is accepted, but it does not get to claim someone else's order.
      expect(response.body.orderId).toBeNull();
    });
  });
});
