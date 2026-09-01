import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { generateId, hashSessionToken } from '../../src/common/crypto/tokens';
import { RATE_LIMITS, RateLimitService } from '../../src/common/rate-limit/rate-limit.service';

/**
 * The parts of the session lifecycle that only show up when the pieces run
 * together: what happens to a guest's order when they sign in, what the browser
 * is actually told to store, and what happens when two requests race.
 */
describe('session lifecycle', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;

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
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'EC-LIFE' } } });
    await prisma.checkoutSession.deleteMany({ where: { id: { startsWith: 'cs-life-' } } });
    await app?.close();
    await prisma.$disconnect();
  });

  /** Starts an anonymous session the way a real visitor would, and returns its cookie. */
  async function anonymousSession(): Promise<{ cookie: string; sessionId: string }> {
    const token = 'anon-' + Math.random().toString(36).slice(2, 12);
    const session = await prisma.customerSession.create({
      data: {
        id: generateId('sess'),
        customerId: null,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return { cookie: `tt_session=${token}`, sessionId: session.id };
  }

  /** Writes an order owned by an anonymous session. */
  async function guestOrder(suffix: string, sessionId: string): Promise<string> {
    const offer = await prisma.offer.findFirstOrThrow();
    const key = `cs-life-${suffix}`;
    const orderId = generateId('ord');

    await prisma.checkoutSession.create({
      data: {
        id: key,
        status: 'COMPLETED',
        pricingSnapshot: {},
        requirementsSnapshot: [],
        currency: 'ILS',
        regionId: offer.regionId,
        subtotalMinor: 5000,
        discountMinor: 0,
        totalMinor: 5000,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `EC-LIFE-${suffix}`,
        checkoutSessionId: key,
        sessionId,
        customerId: null,
        contactEmail: 'guest@example.com',
        regionId: offer.regionId,
        currency: 'ILS',
        subtotalMinor: 5000,
        discountMinor: 0,
        totalMinor: 5000,
        pricingSnapshot: {},
      },
    });

    return orderId;
  }

  async function signIn(address: string, cookie?: string) {
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .set(cookie ? { Cookie: cookie } : {})
      .send({ email: address })
      .expect(204);

    const verify = request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ email: address, code: requested.headers['x-dev-otp'] });
    if (cookie) {
      verify.set('Cookie', cookie);
    }
    return verify.expect(200);
  }

  // -------------------------------------------------------------------------
  describe('a guest who signs in keeps the order they already placed', () => {
    it('transfers the order to the new account', async () => {
      const guest = await anonymousSession();
      const orderId = await guestOrder('claim', guest.sessionId);

      // Visible to the guest session first.
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', guest.cookie)
        .expect(200);

      const signedIn = await signIn(email(), guest.cookie);
      const newCookie = signedIn.headers['set-cookie'][0].split(';')[0];

      // Still visible afterwards, now through the authenticated session.
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', newCookie)
        .expect(200);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.customerId).not.toBeNull();
    });

    it('leaves the old cookie unable to read it, because sign-in revoked that session', async () => {
      const guest = await anonymousSession();
      const orderId = await guestOrder('revoked', guest.sessionId);

      await signIn(email(), guest.cookie);

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', guest.cookie)
        .expect(404);
    });

    it('never claims an order belonging to a different session', async () => {
      const victim = await anonymousSession();
      const orderId = await guestOrder('victim', victim.sessionId);

      const attacker = await anonymousSession();
      const signedIn = await signIn(email(), attacker.cookie);
      const attackerCookie = signedIn.headers['set-cookie'][0].split(';')[0];

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', attackerCookie)
        .expect(404);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.customerId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('what the browser is told to store', () => {
    it('sets Path, an expiry and SameSite, so the cookie is scoped and survives a restart', async () => {
      const signedIn = await signIn(email());
      const header: string = signedIn.headers['set-cookie'][0];

      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/Path=\//i);
      expect(header).toMatch(/SameSite=/i);
      // A session cookie with no expiry would be lost when the browser closes,
      // taking a guest's access to their own order with it.
      expect(header).toMatch(/Expires=/i);
    });

    it('marks the cookie Secure when configured for a deployed environment', async () => {
      // A second app, configured the way staging is, to prove the flag is
      // driven by configuration rather than hard-coded off.
      const previous = process.env.COOKIE_SECURE;
      process.env.COOKIE_SECURE = 'true';

      let secureApp: NestExpressApplication | undefined;
      try {
        secureApp = await createApp();
        await secureApp.init();

        const address = email();
        const requested = await request(secureApp.getHttpServer())
          .post('/api/v1/auth/request-code')
          .send({ email: address })
          .expect(204);
        const verified = await request(secureApp.getHttpServer())
          .post('/api/v1/auth/verify-code')
          .send({ email: address, code: requested.headers['x-dev-otp'] })
          .expect(200);

        expect(verified.headers['set-cookie'][0]).toMatch(/Secure/);
      } finally {
        await secureApp?.close();
        if (previous === undefined) {
          delete process.env.COOKIE_SECURE;
        } else {
          process.env.COOKIE_SECURE = previous;
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('concurrency', () => {
    it('counts concurrent rate-limit hits exactly once each', async () => {
      // The check-then-write shape of a naive limiter loses hits under load,
      // which is how a limit of 3 turns into 10. This one counts in the
      // database, so twenty parallel calls produce twenty.
      const limiter = app.get(RateLimitService);
      const rule = { name: 'test:concurrency', limit: 1000, windowSeconds: 60 };
      const key = `race-${Math.random().toString(36).slice(2, 10)}`;

      await Promise.all(Array.from({ length: 20 }, () => limiter.consume(rule, key)));

      expect(await limiter.peek(rule, key)).toBe(20);
    });

    it('lets only one of two simultaneous verifications of the same code succeed', async () => {
      const address = email();
      const requested = await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: address })
        .expect(204);
      const code = requested.headers['x-dev-otp'];

      const results = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/auth/verify-code').send({ email: address, code }),
        request(app.getHttpServer()).post('/api/v1/auth/verify-code').send({ email: address, code }),
      ]);

      const accepted = results.filter((response) => response.status === 200);
      expect(accepted).toHaveLength(1);

      // And exactly one customer exists, rather than two racing inserts.
      const customers = await prisma.customer.count({ where: { email: address } });
      expect(customers).toBe(1);
    });

    it('keeps the per-email limit intact under parallel requests', async () => {
      const address = email();
      const rule = RATE_LIMITS.otpRequestPerEmail;

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app.getHttpServer()).post('/api/v1/auth/request-code').send({ email: address }),
        ),
      );

      const allowed = results.filter((response) => response.status === 204).length;
      expect(allowed).toBeLessThanOrEqual(rule.limit);
      expect(results.some((response) => response.status === 429)).toBe(true);
    });
  });
});
