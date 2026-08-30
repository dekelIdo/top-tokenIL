import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { CHECKOUT_FIELD_KEYS } from '../../src/common/checkout/requirement-keys';

/**
 * The commerce security matrix, against a running server and a real PostgreSQL.
 *
 * The property under test throughout: the browser may say what a customer wants
 * to buy, and nothing else. Every figure with a currency attached has to come
 * from the database, and no request may talk its way past that.
 */
describe('commerce security', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  /** A well-stocked digital offer, used as the baseline for most tests. */
  let offerId: string;
  let offerPriceMinor: number;
  let secondOfferId: string;

  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    app = await createApp();
    await app.init();
    await prisma.$connect();

    const offers = await prisma.offer.findMany({
      where: { active: true, inventory: { status: 'IN_STOCK' } },
      orderBy: { id: 'asc' },
      take: 2,
    });
    offerId = offers[0].id;
    offerPriceMinor = offers[0].priceAmountMinor;
    secondOfferId = offers[1].id;
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const post = (path: string, body: object, cookie?: string) => {
    const call = request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
    return cookie ? call.set('Cookie', cookie) : call;
  };

  /** Opens a checkout and returns its id plus the session cookie that owns it. */
  async function openCheckout(items = [{ offerId, quantity: 1 }], cookie?: string) {
    const response = await post('/checkout/sessions', { items }, cookie).expect(201);
    const setCookie = response.headers['set-cookie'];
    return {
      id: response.body.id as string,
      body: response.body,
      cookie: cookie ?? (setCookie ? setCookie[0].split(';')[0] : ''),
    };
  }

  async function signIn(address: string, cookie?: string) {
    const requested = await post('/auth/request-code', { email: address }, cookie).expect(204);
    const verify = post('/auth/verify-code', {
      email: address,
      code: requested.headers['x-dev-otp'],
    }, cookie);
    const verified = await verify.expect(200);
    return verified.headers['set-cookie'][0].split(';')[0];
  }

  // -------------------------------------------------------------------------
  describe('financial values cannot be supplied by the client', () => {
    it('rejects a submitted unit price outright', async () => {
      const response = await post('/cart/items', {
        offerId,
        quantity: 1,
        unitPrice: { amountMinor: 1, currency: 'ILS' },
      });

      // Rejected by validation, not ignored. An attempt to state a price is a
      // loud failure that lands in the logs rather than a value quietly dropped.
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a submitted total on cart validation', async () => {
      const response = await post('/cart/validate', {
        items: [{ offerId, quantity: 1 }],
        totals: { total: { amountMinor: 0, currency: 'ILS' } },
      });

      expect(response.status).toBe(422);
    });

    it('rejects a submitted discount', async () => {
      const response = await post('/checkout/sessions', {
        items: [{ offerId, quantity: 1 }],
        discountMinor: 5000,
      });

      expect(response.status).toBe(422);
    });

    it('rejects a price hidden inside a cart line', async () => {
      const response = await post('/cart/validate', {
        items: [{ offerId, quantity: 1, unitPriceMinor: 1 }],
      });

      expect(response.status).toBe(422);
    });

    it('prices the line from the database, not from anything the client knows', async () => {
      const response = await post('/cart/items', { offerId, quantity: 3 }).expect(201);

      expect(response.body.unitPrice.amountMinor).toBe(offerPriceMinor);
      expect(response.body.totalPrice.amountMinor).toBe(offerPriceMinor * 3);
    });

    it('computes the checkout total server-side, and it matches the catalog', async () => {
      const { body } = await openCheckout([{ offerId, quantity: 2 }]);

      expect(body.cart.totals.subtotal.amountMinor).toBe(offerPriceMinor * 2);
      expect(body.cart.totals.total.amountMinor).toBe(
        body.cart.totals.subtotal.amountMinor - body.cart.totals.discount.amountMinor,
      );
    });

    it('stores the same total in the database as it returned', async () => {
      const { id, body } = await openCheckout([{ offerId, quantity: 2 }]);
      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id } });

      expect(row.totalMinor).toBe(body.cart.totals.total.amountMinor);
      expect(row.subtotalMinor).toBe(offerPriceMinor * 2);
    });
  });

  // -------------------------------------------------------------------------
  describe('offer substitution and quantity abuse', () => {
    it('refuses an offer id that does not exist', async () => {
      const response = await post('/cart/items', { offerId: 'offer_invented', quantity: 1 });
      expect(response.status).toBe(404);
    });

    it('refuses a disabled offer', async () => {
      // The seed keeps every offer live, so one is withdrawn for the duration of
      // this test and restored afterwards.
      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });

      try {
        const response = await post('/cart/items', { offerId: secondOfferId, quantity: 1 });

        // Not found rather than "disabled": whether we once sold it is not the
        // caller's business.
        expect(response.status).toBe(404);
      } finally {
        await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });
      }
    });

    it('drops a disabled offer from a cart instead of pricing it', async () => {
      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });

      try {
        const response = await post('/cart/validate', {
          items: [{ offerId, quantity: 1 }, { offerId: secondOfferId, quantity: 1 }],
        }).expect(200);

        expect(response.body.valid).toBe(false);
        expect(response.body.cart.totals.subtotal.amountMinor).toBe(offerPriceMinor);
      } finally {
        await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });
      }
    });

    it('refuses to open a checkout containing only a withdrawn offer', async () => {
      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });

      try {
        const response = await post('/checkout/sessions', {
          items: [{ offerId: secondOfferId, quantity: 1 }],
        });
        expect(response.status).toBe(400);
        expect(response.body.code).toBe('CART_EMPTY');
      } finally {
        await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });
      }
    });

    it('refuses an out-of-stock offer', async () => {
      const soldOut = await prisma.offer.findFirstOrThrow({
        where: { active: true, inventory: { status: 'OUT_OF_STOCK' } },
      });
      const response = await post('/cart/items', { offerId: soldOut.id, quantity: 1 });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('OFFER_UNAVAILABLE');
    });

    it('refuses a quantity of zero', async () => {
      expect((await post('/cart/items', { offerId, quantity: 0 })).status).toBe(422);
    });

    it('refuses a negative quantity, which would be a credit', async () => {
      expect((await post('/cart/items', { offerId, quantity: -5 })).status).toBe(422);
    });

    it('refuses a fractional quantity', async () => {
      expect((await post('/cart/items', { offerId, quantity: 1.5 })).status).toBe(422);
    });

    it('refuses an absurd quantity rather than pricing it', async () => {
      expect((await post('/cart/items', { offerId, quantity: 1_000_000 })).status).toBe(422);
    });

    it('refuses a quantity expressed as a string', async () => {
      expect((await post('/cart/items', { offerId, quantity: '5' })).status).toBe(422);
    });

    it('caps a cart at a sane number of lines', async () => {
      const items = Array.from({ length: 40 }, () => ({ offerId, quantity: 1 }));
      expect((await post('/cart/validate', { items })).status).toBe(422);
    });

    it('reports a sold-out line as an issue rather than failing the whole cart', async () => {
      const soldOut = await prisma.offer.findFirstOrThrow({
        where: { active: true, inventory: { status: 'OUT_OF_STOCK' } },
      });

      const response = await post('/cart/validate', {
        items: [{ offerId, quantity: 1 }, { offerId: soldOut.id, quantity: 1 }],
      }).expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.issues.some((issue: { code: string }) => issue.code === 'OUT_OF_STOCK')).toBe(true);
      // The sold-out line contributes nothing to the amount owed.
      expect(response.body.cart.totals.subtotal.amountMinor).toBe(offerPriceMinor);
    });
  });

  // -------------------------------------------------------------------------
  describe('discounts come from the database', () => {
    it('treats an unknown coupon as worth nothing', async () => {
      const response = await post('/promotions/validate', {
        items: [{ offerId, quantity: 1 }],
        code: 'not-a-real-code',
      }).expect(200);

      expect(response.body.applied).toBe(false);
      expect(response.body.discount.amountMinor).toBe(0);
    });

    it('ignores an unknown coupon when totalling a checkout', async () => {
      const { body } = await openCheckout([{ offerId, quantity: 1 }]);
      const withCoupon = await post('/checkout/sessions', {
        items: [{ offerId, quantity: 1 }],
        couponCode: 'free-stuff',
      }).expect(201);

      expect(withCoupon.body.cart.totals.total.amountMinor).toBe(body.cart.totals.total.amountMinor);
    });

    it('never lets a discount drive a total below zero', async () => {
      const rows = await prisma.checkoutSession.findMany({ take: 200 });
      for (const row of rows) {
        expect(row.totalMinor).toBeGreaterThanOrEqual(0);
        expect(row.totalMinor).toBe(row.subtotalMinor - row.discountMinor);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('checkout ownership', () => {
    it('refuses a checkout to a caller with no session', async () => {
      const { id } = await openCheckout();
      await request(app.getHttpServer()).get(`/api/v1/checkout/sessions/${id}`).expect(404);
    });

    it('refuses a checkout belonging to another session', async () => {
      const { id } = await openCheckout();
      const stranger = await openCheckout();

      await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', stranger.cookie)
        .expect(404);
    });

    it('lets the owner read their own checkout', async () => {
      const { id, cookie } = await openCheckout();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(response.body.id).toBe(id);
    });

    it('answers not-found rather than forbidden, so existence is never confirmed', async () => {
      const { id } = await openCheckout();
      const stranger = await openCheckout();

      const foreign = await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', stranger.cookie);
      const invented = await request(app.getHttpServer())
        .get('/api/v1/checkout/sessions/cs_completely_invented')
        .set('Cookie', stranger.cookie);

      expect(foreign.status).toBe(404);
      expect(invented.status).toBe(404);
      expect(foreign.body.code).toBe(invented.body.code);
      expect(foreign.body.userMessage).toEqual(invented.body.userMessage);
    });

    it('refuses to accept details for someone else\'s checkout', async () => {
      const { id } = await openCheckout();
      const stranger = await openCheckout();

      await post(`/checkout/sessions/${id}/validate`, { values: { EMAIL: 'x@example.com' } }, stranger.cookie)
        .expect(404);
    });

    it('survives a reload: the checkout is still there on a later request', async () => {
      const { id, cookie, body } = await openCheckout([{ offerId, quantity: 2 }]);

      const reloaded = await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(reloaded.body.cart.totals.total.amountMinor).toBe(body.cart.totals.total.amountMinor);
      expect(reloaded.body.cart.items).toHaveLength(1);
    });

    it('keeps the checkout after a server restart, because it lives in PostgreSQL', async () => {
      const { id, cookie } = await openCheckout();

      await app.close();
      app = await createApp();
      await app.init();

      const afterRestart = await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(afterRestart.body.id).toBe(id);
    });
  });

  // -------------------------------------------------------------------------
  describe('the checkout snapshot is authoritative', () => {
    it('holds its price even after the catalog price changes', async () => {
      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: secondOfferId } });
      const { id, cookie, body } = await openCheckout([{ offerId: secondOfferId, quantity: 1 }]);
      const agreed = body.cart.totals.total.amountMinor;

      try {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: offer.priceAmountMinor + 5000 },
        });

        const reread = await request(app.getHttpServer())
          .get(`/api/v1/checkout/sessions/${id}`)
          .set('Cookie', cookie)
          .expect(200);

        // The customer is charged what they were shown, not what the catalog
        // says a minute later.
        expect(reread.body.cart.totals.total.amountMinor).toBe(agreed);
      } finally {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: offer.priceAmountMinor },
        });
      }
    });

    it('refuses to open a checkout for an empty cart', async () => {
      expect((await post('/checkout/sessions', { items: [] })).status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('checkout requirements stay inside the closed vocabulary', () => {
    it('never serves a requirement key outside the allowed nine', async () => {
      const offers = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);

      const slugs = offers.body.items.map((product: { slug: string }) => product.slug);
      const allowed = new Set<string>(CHECKOUT_FIELD_KEYS);

      for (const slug of slugs) {
        const detail = await request(app.getHttpServer())
          .get(`/api/v1/products/${slug}`)
          .expect(200);

        for (const offer of detail.body.offers) {
          for (const requirement of offer.checkoutRequirements ?? []) {
            expect(allowed.has(requirement.key)).toBe(true);
            expect(requirement.control).not.toBe('password');
          }
        }
      }
    });

    it('never asks for anything credential-shaped', async () => {
      // Only the machine-readable parts are scanned. Label and hint copy is
      // exempt on purpose: "we will never ask for your password" is exactly the
      // reassurance a customer should see, and matching on it would punish
      // honest wording.
      const forbidden = /password|passwd|cvv|card|pan|secret|2fa|otp|recovery|security.?question/i;

      const offers = await prisma.offer.findMany({ select: { checkoutRequirements: true } });
      for (const offer of offers) {
        const requirements = Array.isArray(offer.checkoutRequirements)
          ? (offer.checkoutRequirements as Record<string, unknown>[])
          : [];

        for (const requirement of requirements) {
          expect(String(requirement['key'])).not.toMatch(forbidden);
          expect(String(requirement['control'])).not.toMatch(forbidden);
          expect(String(requirement['control'])).not.toBe('password');
        }
      }
    });

    it('always asks for an email, so there is somewhere to deliver', async () => {
      const { body } = await openCheckout();
      const keys = body.requirements.map((requirement: { key: string }) => requirement.key);

      // Offers declare only what is specific to them. An offer that forgets to
      // ask for an address must not produce a checkout with nowhere to send the
      // code.
      expect(keys).toContain('EMAIL');
      expect(keys).toContain('TERMS_ACCEPTANCE');
    });

    it('drops a requirement key the database should never have held', async () => {
      // Simulates a bad row reaching the offers table. The allowlist is the
      // reason it cannot become a field in front of a customer.
      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
      const original = offer.checkoutRequirements;

      try {
        await prisma.offer.update({
          where: { id: offerId },
          data: {
            checkoutRequirements: [
              ...(Array.isArray(original) ? original : []),
              {
                key: 'PSN_PASSWORD',
                control: 'text',
                label: { he: 'סיסמה', en: 'Password' },
                required: true,
              },
            ],
          },
        });

        const response = await request(app.getHttpServer())
          .get(`/api/v1/offers/${encodeURIComponent(offerId)}`)
          .expect(200);

        const keys = response.body.checkoutRequirements.map((r: { key: string }) => r.key);
        expect(keys).not.toContain('PSN_PASSWORD');
      } finally {
        await prisma.offer.update({
          where: { id: offerId },
          data: { checkoutRequirements: original as object[] },
        });
      }
    });

    it('refuses to store a submitted value for a field no offer asked for', async () => {
      const { id, cookie } = await openCheckout();

      const response = await post(`/checkout/sessions/${id}/validate`, {
        values: { EMAIL: 'buyer@example.com', PSN_PASSWORD: 'hunter2' },
      }, cookie).expect(200);

      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id } });
      expect(JSON.stringify(row.contactValues)).not.toContain('hunter2');
      expect(response.body.issues.some((issue: { field: string }) => issue.field === 'PSN_PASSWORD')).toBe(true);
    });

    it('reports missing required fields instead of accepting a blank checkout', async () => {
      const { id, cookie } = await openCheckout();

      const response = await post(`/checkout/sessions/${id}/validate`, { values: {} }, cookie).expect(200);

      expect(response.body.issues.length).toBeGreaterThan(0);
      expect(response.body.session.step).toBe('DETAILS');
    });

    it('advances the step only once every requirement is satisfied', async () => {
      const { id, cookie, body } = await openCheckout();

      const values: Record<string, string | boolean> = {};
      for (const requirement of body.requirements) {
        if (!requirement.required) {
          continue;
        }
        values[requirement.key] =
          requirement.control === 'checkbox'
            ? true
            : requirement.key === 'EMAIL'
              ? 'buyer@example.com'
              : requirement.options?.length
                ? requirement.options[0].value
                : 'Test Value';
      }

      const response = await post(`/checkout/sessions/${id}/validate`, { values }, cookie).expect(200);

      expect(response.body.issues).toHaveLength(0);
      expect(response.body.session.step).toBe('PAYMENT');
    });

    it('refuses an over-long value rather than truncating it into the database', async () => {
      const { id, cookie } = await openCheckout();

      const response = await post(`/checkout/sessions/${id}/validate`, {
        values: { SERVICE_NOTE: 'x'.repeat(5000) },
      }, cookie).expect(200);

      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id } });
      expect(JSON.stringify(row.contactValues)).not.toContain('x'.repeat(600));
      expect(response.body.issues.length).toBeGreaterThan(0);
    });

    it('does not treat a truthy string as consent on a checkbox', async () => {
      const { id, cookie } = await openCheckout();

      await post(`/checkout/sessions/${id}/validate`, {
        values: { TERMS_ACCEPTANCE: 'yes' },
      }, cookie).expect(200);

      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id } });
      const stored = (row.contactValues ?? {}) as Record<string, unknown>;
      expect(stored['TERMS_ACCEPTANCE']).not.toBe('yes');
    });
  });

  // -------------------------------------------------------------------------
  describe('malformed and hostile input', () => {
    it('rejects a missing body', async () => {
      expect((await post('/cart/items', {})).status).toBe(422);
    });

    it('rejects an offer id of the wrong type', async () => {
      expect((await post('/cart/items', { offerId: { $ne: null }, quantity: 1 })).status).toBe(422);
    });

    it('rejects items that are not an array', async () => {
      expect((await post('/cart/validate', { items: 'everything' })).status).toBe(422);
    });

    it('rejects a null line inside the array', async () => {
      expect((await post('/cart/validate', { items: [null] })).status).toBe(422);
    });

    it('rejects an unexpected top-level property', async () => {
      expect((await post('/cart/validate', { items: [], isAdmin: true })).status).toBe(422);
    });

    it('rejects a coupon code containing punctuation used for injection', async () => {
      const response = await post('/promotions/validate', {
        items: [{ offerId, quantity: 1 }],
        code: "' OR 1=1 --",
      });
      expect(response.status).toBe(422);
    });

    it('treats a search term with SQL punctuation as ordinary text', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ search: "'; DROP TABLE products; --" })
        .expect(200);

      expect(response.body.items).toHaveLength(0);
      // The table is still there, which a successful injection would have changed.
      expect(await prisma.product.count()).toBeGreaterThan(0);
    });

    it('never leaks a stack trace or a database error', async () => {
      const response = await post('/cart/items', { offerId: 'offer_invented', quantity: 1 });
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/prisma|postgres|at Object|\.ts:\d+/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('catalog integrity', () => {
    it('never advertises a product with no live offer', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ pageSize: 100 })
        .expect(200);

      for (const product of response.body.items) {
        const sellable = await prisma.offer.count({
          where: { productId: product.id, active: true },
        });
        expect(sellable).toBeGreaterThan(0);
      }
    });

    it('lists only platforms and regions its offers actually cover', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ pageSize: 100 })
        .expect(200);

      for (const product of response.body.items) {
        const offers = await prisma.offer.findMany({
          where: { productId: product.id, active: true },
          select: { platformId: true, regionId: true },
        });

        expect([...product.platformIds].sort()).toEqual(
          [...new Set(offers.map((offer) => offer.platformId))].sort(),
        );
        expect([...product.regionIds].sort()).toEqual(
          [...new Set(offers.map((offer) => offer.regionId))].sort(),
        );
      }
    });

    it('filters by platform using live offers, so a filter never lies', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ platformIds: 'plat-ps5', pageSize: 100 })
        .expect(200);

      for (const product of response.body.items) {
        expect(product.platformIds).toContain('plat-ps5');
      }
    });

    it('hides an inactive product behind a not-found', async () => {
      const inactive = await prisma.product.findFirst({ where: { active: false } });
      if (!inactive) {
        // The seed keeps everything live; nothing to assert against.
        return;
      }
      await request(app.getHttpServer()).get(`/api/v1/products/${inactive.slug}`).expect(404);
    });

    it('bounds the page size however large a page is requested', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ pageSize: 100000 })
        .expect(200);

      expect(response.body.pageSize).toBeLessThanOrEqual(100);
    });

    it('publishes an exact stock count only when stock is genuinely low', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ pageSize: 100 })
        .expect(200);

      for (const product of response.body.items) {
        const detail = await request(app.getHttpServer())
          .get(`/api/v1/products/${product.slug}`)
          .expect(200);

        for (const offer of detail.body.offers) {
          if (offer.inventory.remaining !== null) {
            expect(offer.inventory.remaining).toBeLessThanOrEqual(10);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('concurrency', () => {
    it('prices ten simultaneous cart validations identically', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          post('/cart/validate', { items: [{ offerId, quantity: 2 }] }),
        ),
      );

      const totals = new Set(results.map((response) => response.body.cart.totals.total.amountMinor));
      expect(results.every((response) => response.status === 200)).toBe(true);
      expect(totals.size).toBe(1);
    });

    it('opens concurrent checkouts without mixing their contents', async () => {
      const [first, second] = await Promise.all([
        post('/checkout/sessions', { items: [{ offerId, quantity: 1 }] }),
        post('/checkout/sessions', { items: [{ offerId, quantity: 3 }] }),
      ]);

      expect(first.body.id).not.toBe(second.body.id);
      expect(first.body.cart.totals.subtotal.amountMinor).toBe(offerPriceMinor);
      expect(second.body.cart.totals.subtotal.amountMinor).toBe(offerPriceMinor * 3);
    });

    it('writes a checkout and its lines atomically', async () => {
      const { id } = await openCheckout([{ offerId, quantity: 1 }, { offerId: secondOfferId, quantity: 1 }]);

      const items = await prisma.checkoutItem.count({ where: { checkoutSessionId: id } });
      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id } });

      expect(items).toBe(2);
      expect(row.subtotalMinor).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('sessions carry ownership into checkout', () => {
    it('gives a signed-in customer their own checkout, not a stranger\'s', async () => {
      const ownerCookie = await signIn(email());
      const { id } = await openCheckout([{ offerId, quantity: 1 }], ownerCookie);

      const strangerCookie = await signIn(email());
      await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', strangerCookie)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/v1/checkout/sessions/${id}`)
        .set('Cookie', ownerCookie)
        .expect(200);
    });

    it('does not create a session merely for browsing the catalog', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('creates a session when a checkout is opened, because it needs an owner', async () => {
      const response = await post('/checkout/sessions', { items: [{ offerId, quantity: 1 }] }).expect(201);
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });
});
