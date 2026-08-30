import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { generateId, hashSessionToken } from '../../src/common/crypto/tokens';

/**
 * Order authorization, against a running server and a real PostgreSQL.
 *
 * The property under test is the one that matters most commercially: knowing an
 * order id must never be enough to read the order. Every test here plays the
 * part of someone holding an id they were not given.
 */
describe('order authorization', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;

  /**
   * Unique per run, because the development database persists between runs. A
   * run that is interrupted before its cleanup would otherwise leave rows that
   * collide with the next one, which looks like a product failure and is not.
   */
  const run = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    app = await createApp();
    await app.init();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'TT-AUTH' } } });
    await prisma.checkoutSession.deleteMany({ where: { id: { startsWith: 'cs-auth-' } } });
    await app?.close();
    await prisma.$disconnect();
  });

  /**
   * Creates an order owned by a session, a customer, or neither.
   *
   * Order creation is a later phase, so the rows are written directly. The
   * authorization path being tested is the real one.
   */
  async function createOrder(options: {
    suffix: string;
    sessionId?: string | null;
    customerId?: string | null;
  }): Promise<string> {
    const offer = await prisma.offer.findFirstOrThrow();
    const sessionKey = `cs-auth-${run}-${options.suffix}`;
    const orderId = generateId('ord');

    await prisma.checkoutSession.create({
      data: {
        id: sessionKey,
        status: 'COMPLETED',
        pricingSnapshot: {},
        requirementsSnapshot: [],
        currency: 'ILS',
        regionId: offer.regionId,
        subtotalMinor: 10000,
        discountMinor: 0,
        totalMinor: 10000,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `TT-AUTH-${run}-${options.suffix}`,
        checkoutSessionId: sessionKey,
        sessionId: options.sessionId ?? null,
        customerId: options.customerId ?? null,
        contactEmail: 'owner@example.com',
        regionId: offer.regionId,
        currency: 'ILS',
        subtotalMinor: 10000,
        discountMinor: 0,
        totalMinor: 10000,
        pricingSnapshot: {},
      },
    });

    return orderId;
  }

  /** Signs in and returns both the cookie and the session row id. */
  async function signIn(address: string): Promise<{ cookie: string; sessionId: string; customerId: string }> {
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: address })
      .expect(204);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ email: address, code: requested.headers['x-dev-otp'] })
      .expect(200);

    const cookie = verified.headers['set-cookie'][0].split(';')[0];
    const token = cookie.split('=')[1];
    const session = await prisma.customerSession.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(token) },
    });

    return { cookie, sessionId: session.id, customerId: session.customerId as string };
  }

  // -------------------------------------------------------------------------
  describe('an order id alone grants nothing', () => {
    it('refuses a caller with no session at all', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'nosession', customerId: owner.customerId });

      // No cookie: the order exists and belongs to someone, but the caller is
      // nobody.
      await request(app.getHttpServer()).get(`/api/v1/orders/${orderId}`).expect(404);
    });

    it('refuses a different customer holding the id', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'owned', customerId: owner.customerId });

      const stranger = await signIn(email());
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', stranger.cookie)
        .expect(404);
    });

    it('refuses a different anonymous session holding the id', async () => {
      const ownerSession = await signIn(email());
      const orderId = await createOrder({ suffix: 'anon', sessionId: ownerSession.sessionId });

      const stranger = await signIn(email());
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', stranger.cookie)
        .expect(404);
    });

    it('answers not-found rather than forbidden, so existence is never confirmed', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'hidden', customerId: owner.customerId });
      const stranger = await signIn(email());

      const foreign = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', stranger.cookie);
      const invented = await request(app.getHttpServer())
        .get('/api/v1/orders/ord_completely_invented')
        .set('Cookie', stranger.cookie);

      // A real order the caller may not see is indistinguishable from one that
      // does not exist. Status, code and message all match.
      expect(foreign.status).toBe(404);
      expect(invented.status).toBe(404);
      expect(foreign.body.code).toBe(invented.body.code);
      expect(foreign.body.userMessage).toEqual(invented.body.userMessage);
    });

    it('applies the same rule to the status endpoint', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'status', customerId: owner.customerId });
      const stranger = await signIn(email());

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/status`)
        .set('Cookie', stranger.cookie)
        .expect(404);
    });

    it('refuses an order with no owner at all, rather than treating it as public', async () => {
      const orderId = await createOrder({ suffix: 'orphan', sessionId: null, customerId: null });
      const anyone = await signIn(email());

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', anyone.cookie)
        .expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('owners can read their own orders', () => {
    it('lets the owning customer read the order', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'mine', customerId: owner.customerId });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(response.body.id).toBe(orderId);
      // The contract calls this `reference`; the column is `orderNumber`.
      expect(response.body.reference).toBe(`TT-AUTH-${run}-mine`);
    });

    it('lets the owning session read an order placed without an account', async () => {
      const guest = await signIn(email());
      const orderId = await createOrder({ suffix: 'guest', sessionId: guest.sessionId });

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', guest.cookie)
        .expect(200);
    });

    it('stops showing the order once the session is revoked', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'revoked', customerId: owner.customerId });

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', owner.cookie)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', owner.cookie)
        .expect(404);
    });

    it('lists only the caller\'s own orders', async () => {
      const owner = await signIn(email());
      await createOrder({ suffix: 'list1', customerId: owner.customerId });
      await createOrder({ suffix: 'list2', customerId: owner.customerId });

      const stranger = await signIn(email());
      await createOrder({ suffix: 'list3', customerId: stranger.customerId });

      const mine = await request(app.getHttpServer())
        .get('/api/v1/account/orders')
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(mine.body.total).toBe(2);
      const references = mine.body.items.map((o: { reference: string }) => o.reference);
      expect(references).toEqual(expect.arrayContaining([`TT-AUTH-${run}-list1`, `TT-AUTH-${run}-list2`]));
      expect(references).not.toContain(`TT-AUTH-${run}-list3`);
    });

    it('returns an empty page for a caller with no session, not an error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/account/orders')
        .expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('response hygiene', () => {
    it('never exposes the session id or another customer id', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'hygiene', customerId: owner.customerId });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', owner.cookie)
        .expect(200);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain(owner.sessionId);
      expect(serialised).not.toMatch(/sess_/);
      expect(serialised).not.toMatch(/tokenHash/i);
    });

    it('withholds a delivery payload while the order is unpaid', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'unpaid', customerId: owner.customerId });
      const offer = await prisma.offer.findFirstOrThrow();

      const item = await prisma.orderItem.create({
        data: {
          id: generateId('oi'),
          orderId,
          offerId: offer.id,
          productId: offer.productId,
          variantId: offer.variantId,
          platformId: offer.platformId,
          regionId: offer.regionId,
          quantity: 1,
          unitPriceMinor: 10000,
          totalPriceMinor: 10000,
          displayName: { he: 'מוצר' },
          displayVariant: { he: 'גרסה' },
          fulfillmentMethod: 'DIGITAL_CODE',
        },
      });

      await prisma.fulfillment.create({
        data: {
          id: generateId('ful'),
          orderId,
          orderItemId: item.id,
          method: 'DIGITAL_CODE',
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryPayload: { kind: 'CODE', code: 'SECRET-CODE-VALUE' },
        },
      });

      // The order is still PENDING_PAYMENT, so the code must not be released.
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('SECRET-CODE-VALUE');
      expect(response.body.fulfillments[0].delivery).toBeNull();
    });

    it('releases the delivery payload once the order is paid', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'paid', customerId: owner.customerId });
      const offer = await prisma.offer.findFirstOrThrow();

      const item = await prisma.orderItem.create({
        data: {
          id: generateId('oi'),
          orderId,
          offerId: offer.id,
          productId: offer.productId,
          variantId: offer.variantId,
          platformId: offer.platformId,
          regionId: offer.regionId,
          quantity: 1,
          unitPriceMinor: 10000,
          totalPriceMinor: 10000,
          displayName: { he: 'מוצר' },
          displayVariant: { he: 'גרסה' },
          fulfillmentMethod: 'DIGITAL_CODE',
        },
      });

      await prisma.fulfillment.create({
        data: {
          id: generateId('ful'),
          orderId,
          orderItemId: item.id,
          method: 'DIGITAL_CODE',
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryPayload: { kind: 'CODE', code: 'RELEASED-CODE-VALUE' },
        },
      });

      await prisma.order.update({ where: { id: orderId }, data: { status: 'FULFILLED' } });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(JSON.stringify(response.body)).toContain('RELEASED-CODE-VALUE');
    });

    it('sends an order status the Angular domain actually recognises', async () => {
      const owner = await signIn(email());
      const orderId = await createOrder({ suffix: 'enum', customerId: owner.customerId });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/status`)
        .set('Cookie', owner.cookie)
        .expect(200);

      // The frontend maps an unknown status to PROCESSING rather than erroring,
      // so a drifted enum would be invisible until a customer saw the wrong
      // thing. These are the exact members of the frozen domain enum.
      const known = [
        'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROCESSING',
        'FULFILLMENT_PENDING', 'FULFILLMENT_PROCESSING', 'FULFILLED', 'FAILED',
        'CANCELLED', 'REFUND_PENDING', 'REFUNDED',
      ];
      expect(known).toContain(response.body.status);
    });
  });
});
