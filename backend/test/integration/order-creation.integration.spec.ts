import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';

/**
 * Order creation, against a running server and a real PostgreSQL.
 *
 * Three properties under test:
 *
 * 1. A retry never produces a second order.
 * 2. N units of stock never satisfy more than N buyers.
 * 3. A failure leaves nothing behind: no order, no hold, no claimed key.
 *
 * Concurrency tests issue simultaneous HTTP requests over separate connections
 * rather than simulating a race in one process.
 */
describe('order creation', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  let offerId: string;
  let offerPriceMinor: number;
  let secondOfferId: string;

  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const key = (label: string) => `order-create:${label}-${Math.random().toString(36).slice(2, 10)}`;

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

  const post = (path: string, body: object, cookie?: string, idempotencyKey?: string) => {
    let call = request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
    if (cookie) {
      call = call.set('Cookie', cookie);
    }
    if (idempotencyKey) {
      call = call.set('Idempotency-Key', idempotencyKey);
    }
    return call;
  };

  /** Opens a checkout and fills in every required field, leaving it ready to order. */
  async function readyCheckout(
    items: { offerId: string; quantity: number }[] = [{ offerId, quantity: 1 }],
    existingCookie?: string,
  ): Promise<{ id: string; cookie: string; totalMinor: number }> {
    const created = await post('/checkout/sessions', { items }, existingCookie).expect(201);
    const cookie = existingCookie ?? created.headers['set-cookie'][0].split(';')[0];

    const values: Record<string, string | boolean> = {};
    for (const requirement of created.body.requirements) {
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

    const validated = await post(`/checkout/sessions/${created.body.id}/validate`, { values }, cookie)
      .expect(200);
    expect(validated.body.issues).toHaveLength(0);

    return {
      id: created.body.id,
      cookie,
      totalMinor: created.body.cart.totals.total.amountMinor,
    };
  }

  /**
   * Gives an offer a known finite stock level, and restores it afterwards.
   *
   * The seed leaves most offers effectively unlimited, which is exactly the
   * wrong shape for testing whether the last unit can be sold twice.
   */
  async function withStock<T>(
    targetOfferId: string,
    available: number,
    body: () => Promise<T>,
  ): Promise<T> {
    const before = await prisma.inventory.findUniqueOrThrow({ where: { offerId: targetOfferId } });
    await prisma.inventory.update({
      where: { offerId: targetOfferId },
      data: { quantityAvailable: available, quantityReserved: 0, status: 'IN_STOCK' },
    });

    try {
      return await body();
    } finally {
      await prisma.inventoryReservation.deleteMany({ where: { offerId: targetOfferId } });
      await prisma.inventory.update({
        where: { offerId: targetOfferId },
        data: {
          quantityAvailable: before.quantityAvailable,
          quantityReserved: before.quantityReserved,
          quantitySold: before.quantitySold,
          status: before.status,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  describe('creating an order', () => {
    it('creates one from a checkout that is ready for payment', async () => {
      const checkout = await readyCheckout();

      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('happy'))
        .expect(201);

      expect(response.body.id).toMatch(/^ord_/);
      expect(response.body.reference).toMatch(/^EC-\d{6}$/);
      expect(response.body.status).toBe('PENDING_PAYMENT');
      expect(response.body.totals.total.amountMinor).toBe(checkout.totalMinor);
      expect(response.body.items).toHaveLength(1);
    });

    it('records the totals in the database exactly as it returned them', async () => {
      const checkout = await readyCheckout([{ offerId, quantity: 3 }]);
      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('totals'))
        .expect(201);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(row.subtotalMinor).toBe(offerPriceMinor * 3);
      expect(row.totalMinor).toBe(row.subtotalMinor - row.discountMinor);
      expect(row.totalMinor).toBe(response.body.totals.total.amountMinor);
    });

    it('holds stock in the same transaction as the order', async () => {
      await withStock(secondOfferId, 10, async () => {
        const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 4 }]);
        const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('hold'))
          .expect(201);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        const reservations = await prisma.inventoryReservation.findMany({
          where: { orderId: response.body.id },
        });

        expect(inventory.quantityReserved).toBe(4);
        expect(reservations).toHaveLength(1);
        expect(reservations[0].status).toBe('HELD');
        expect(reservations[0].quantity).toBe(4);
      });
    });

    it('moves the checkout out of the ready state so it cannot be ordered twice', async () => {
      const checkout = await readyCheckout();
      await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('once')).expect(201);

      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: checkout.id } });
      expect(row.status).toBe('PAYMENT_PENDING');
    });

    it('gives each order a distinct reference', async () => {
      const first = await readyCheckout();
      const second = await readyCheckout();

      const a = await post('/orders', { checkoutSessionId: first.id }, first.cookie, key('ref-a')).expect(201);
      const b = await post('/orders', { checkoutSessionId: second.id }, second.cookie, key('ref-b')).expect(201);

      expect(a.body.reference).not.toBe(b.body.reference);
    });

    it('copies the contact email from the checkout, not from the request', async () => {
      const checkout = await readyCheckout();
      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('email'))
        .expect(201);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(row.contactEmail).toBe('buyer@example.com');
    });
  });

  // -------------------------------------------------------------------------
  describe('idempotency', () => {
    it('produces one order for a repeated request with the same key', async () => {
      const checkout = await readyCheckout();
      const idempotencyKey = key('dup');

      const first = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey)
        .expect(201);
      const second = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey)
        .expect(200);

      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(1);
    });

    it('produces one order for two simultaneous requests with the same key', async () => {
      const checkout = await readyCheckout();
      const idempotencyKey = key('race');

      const [a, b] = await Promise.all([
        post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey),
        post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey),
      ]);

      const created = await prisma.order.count({ where: { checkoutSessionId: checkout.id } });
      expect(created).toBe(1);

      // One caller wins with a 201. The other either receives the winner's order
      // with a 200 or is told the work is in flight; both are safe, and neither
      // creates a second order.
      const statuses = [a.status, b.status];
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.every((status) => [200, 201, 409].includes(status))).toBe(true);
    });

    it('produces one order for five simultaneous requests with the same key', async () => {
      const checkout = await readyCheckout();
      const idempotencyKey = key('race5');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey),
        ),
      );

      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(1);
      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(responses.every((response) => [200, 201, 409].includes(response.status))).toBe(true);
    });

    it('refuses the same key for a different request rather than replaying the old one', async () => {
      const first = await readyCheckout();
      const second = await readyCheckout();
      const idempotencyKey = key('reuse');

      await post('/orders', { checkoutSessionId: first.id }, first.cookie, idempotencyKey).expect(201);

      const reused = await post('/orders', { checkoutSessionId: second.id }, second.cookie, idempotencyKey);

      expect(reused.status).toBe(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      // The second checkout must not have quietly become an order.
      expect(await prisma.order.count({ where: { checkoutSessionId: second.id } })).toBe(0);
    });

    it('requires an idempotency key at all', async () => {
      const checkout = await readyCheckout();
      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie);

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
    });

    it('replays the same order after a server restart', async () => {
      const checkout = await readyCheckout();
      const idempotencyKey = key('restart');

      const first = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey)
        .expect(201);

      await app.close();
      app = await createApp();
      await app.init();

      const afterRestart = await post(
        '/orders',
        { checkoutSessionId: checkout.id },
        checkout.cookie,
        idempotencyKey,
      ).expect(200);

      expect(afterRestart.body.id).toBe(first.body.id);
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(1);
    });

    it('stores the key in PostgreSQL, so no restart can forget it', async () => {
      const checkout = await readyCheckout();
      const idempotencyKey = key('durable');
      await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey).expect(201);

      const row = await prisma.idempotencyKey.findUniqueOrThrow({
        where: { key_endpoint: { key: idempotencyKey, endpoint: 'POST /orders' } },
      });

      expect(row.status).toBe('COMPLETED');
      expect(row.responseStatus).toBe(201);
    });

    it('frees the key after a failure, so the customer can try again', async () => {
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 2 }]);
      const idempotencyKey = key('retry');

      // Make the order impossible, then let it fail.
      await prisma.inventory.update({
        where: { offerId: secondOfferId },
        data: { status: 'OUT_OF_STOCK' },
      });

      const failed = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey);
      expect(failed.status).toBe(409);

      const claim = await prisma.idempotencyKey.findUnique({
        where: { key_endpoint: { key: idempotencyKey, endpoint: 'POST /orders' } },
      });
      expect(claim).toBeNull();

      // Now make it possible and retry with the same key.
      await prisma.inventory.update({
        where: { offerId: secondOfferId },
        data: { status: 'IN_STOCK' },
      });

      const retried = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, idempotencyKey);
      expect(retried.status).toBe(201);
    });

    it('returns the existing order when the same checkout is ordered under a new key', async () => {
      const checkout = await readyCheckout();
      const first = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('k1'))
        .expect(201);

      // A different key, but the same checkout. The unique constraint on
      // checkout_session_id is the guard here, not the key.
      const second = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('k2'))
        .expect(200);

      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('inventory cannot be oversold', () => {
    it('refuses a quantity larger than the stock on hand', async () => {
      await withStock(secondOfferId, 3, async () => {
        const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 3 }]);

        // Take the stock away behind the customer's back, as another buyer would.
        await prisma.inventory.update({
          where: { offerId: secondOfferId },
          data: { quantityAvailable: 1 },
        });

        const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('over'));

        expect(response.status).toBe(409);
        expect(response.body.code).toBe('OUT_OF_STOCK');
        expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
      });
    });

    it('lets exactly one of two buyers take the last unit', async () => {
      await withStock(secondOfferId, 1, async () => {
        const first = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);
        const second = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);

        const [a, b] = await Promise.all([
          post('/orders', { checkoutSessionId: first.id }, first.cookie, key('last-a')),
          post('/orders', { checkoutSessionId: second.id }, second.cookie, key('last-b')),
        ]);

        const created = [a, b].filter((response) => response.status === 201);
        const refused = [a, b].filter((response) => response.status === 409);

        expect(created).toHaveLength(1);
        expect(refused).toHaveLength(1);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantityReserved).toBe(1);
      });
    });

    it('never lets N+1 concurrent buyers reserve more than N units', async () => {
      const stock = 5;
      const buyers = 12;

      await withStock(secondOfferId, stock, async () => {
        const checkouts = [];
        for (let index = 0; index < buyers; index += 1) {
          checkouts.push(await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]));
        }

        const responses = await Promise.all(
          checkouts.map((checkout, index) =>
            post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key(`many-${index}`)),
          ),
        );

        const created = responses.filter((response) => response.status === 201);
        const refused = responses.filter((response) => response.status === 409);

        expect(created).toHaveLength(stock);
        expect(refused).toHaveLength(buyers - stock);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        // The database is the authority: reserved can never exceed available.
        expect(inventory.quantityReserved).toBe(stock);
        expect(inventory.quantityReserved).toBeLessThanOrEqual(inventory.quantityAvailable ?? Infinity);
      });
    });

    it('lets one buyer take several units at once, up to the stock level', async () => {
      await withStock(secondOfferId, 6, async () => {
        const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 6 }]);
        await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('bulk')).expect(201);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantityReserved).toBe(6);
      });
    });

    it('refuses an offer that went out of stock after the quote', async () => {
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);
      const before = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });

      try {
        await prisma.inventory.update({
          where: { offerId: secondOfferId },
          data: { status: 'OUT_OF_STOCK' },
        });

        const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('oos'));
        expect(response.status).toBe(409);
        expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
      } finally {
        await prisma.inventory.update({
          where: { offerId: secondOfferId },
          data: { status: before.status },
        });
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('a failed order leaves nothing behind', () => {
    it('holds no stock when the order is refused', async () => {
      await withStock(secondOfferId, 2, async () => {
        const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 2 }]);
        await prisma.inventory.update({
          where: { offerId: secondOfferId },
          data: { quantityAvailable: 1 },
        });

        await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('rollback')).expect(409);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        const reservations = await prisma.inventoryReservation.count({
          where: { checkoutSessionId: checkout.id },
        });

        expect(inventory.quantityReserved).toBe(0);
        expect(reservations).toBe(0);
      });
    });

    it('writes no order row, no items and no reservation when a line is withdrawn', async () => {
      const checkout = await readyCheckout([{ offerId, quantity: 1 }, { offerId: secondOfferId, quantity: 1 }]);
      const before = await prisma.inventory.findUniqueOrThrow({ where: { offerId } });

      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });
      try {
        const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('withdrawn'));
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('CART_INVALID');

        expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
        expect(await prisma.inventoryReservation.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);

        // The first line must not stay reserved just because the second failed.
        // Compared against the level before this test, because other orders in
        // this suite legitimately hold stock on the same offer.
        const after = await prisma.inventory.findUniqueOrThrow({ where: { offerId } });
        expect(after.quantityReserved).toBe(before.quantityReserved);
      } finally {
        await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });
      }
    });

    it('leaves the checkout usable after a failure, so a retry can succeed', async () => {
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);

      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });
      await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('reopen')).expect(409);
      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });

      const row = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: checkout.id } });
      expect(row.status).toBe('READY_FOR_PAYMENT');

      await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('reopen2')).expect(201);
    });
  });

  // -------------------------------------------------------------------------
  describe('the checkout must be in a state that can become an order', () => {
    it('refuses a checkout whose details are incomplete', async () => {
      const created = await post('/checkout/sessions', { items: [{ offerId, quantity: 1 }] }).expect(201);
      const cookie = created.headers['set-cookie'][0].split(';')[0];

      const response = await post('/orders', { checkoutSessionId: created.body.id }, cookie, key('incomplete'));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SESSION_NOT_OPEN');
      expect(await prisma.order.count({ where: { checkoutSessionId: created.body.id } })).toBe(0);
    });

    it('refuses an expired checkout', async () => {
      const checkout = await readyCheckout();
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('stale'));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SESSION_EXPIRED');
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
    });

    it('refuses a checkout that does not exist', async () => {
      const checkout = await readyCheckout();
      const response = await post('/orders', { checkoutSessionId: 'cs_invented' }, checkout.cookie, key('missing'));
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('the client is never authoritative', () => {
    it('rejects a price sent with the order request', async () => {
      const checkout = await readyCheckout();
      const response = await post(
        '/orders',
        { checkoutSessionId: checkout.id, totalMinor: 1 },
        checkout.cookie,
        key('tamper-total'),
      );

      expect(response.status).toBe(422);
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
    });

    it('rejects a substituted offer sent with the order request', async () => {
      const checkout = await readyCheckout();
      const response = await post(
        '/orders',
        { checkoutSessionId: checkout.id, items: [{ offerId: secondOfferId, quantity: 99 }] },
        checkout.cookie,
        key('tamper-items'),
      );

      expect(response.status).toBe(422);
    });

    it('charges the quoted price even when the catalog price changed', async () => {
      const original = await prisma.offer.findUniqueOrThrow({ where: { id: secondOfferId } });
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 2 }]);
      const quoted = checkout.totalMinor;

      try {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: original.priceAmountMinor * 3 },
        });

        const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('quote'))
          .expect(201);

        // The customer pays what they were shown, not what the catalog now says.
        expect(response.body.totals.total.amountMinor).toBe(quoted);
      } finally {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: original.priceAmountMinor },
        });
      }
    });

    it('refuses a checkout whose stored total disagrees with its own lines', async () => {
      const checkout = await readyCheckout();

      // Simulates a corrupted snapshot. No endpoint can do this, which is why it
      // is done directly; the point is that the order refuses to charge from it.
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { subtotalMinor: 1, totalMinor: 1 },
      });

      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('corrupt'));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CART_INVALID');
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('the order snapshot is history, not a view of the catalog', () => {
    it('does not change when the offer price changes afterwards', async () => {
      const original = await prisma.offer.findUniqueOrThrow({ where: { id: secondOfferId } });
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('history'))
        .expect(201);

      try {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: original.priceAmountMinor + 12345 },
        });

        const reread = await request(app.getHttpServer())
          .get(`/api/v1/orders/${created.body.id}`)
          .set('Cookie', checkout.cookie)
          .expect(200);

        expect(reread.body.totals.total.amountMinor).toBe(created.body.totals.total.amountMinor);
        expect(reread.body.items[0].unitPrice.amountMinor).toBe(
          created.body.items[0].unitPrice.amountMinor,
        );
      } finally {
        await prisma.offer.update({
          where: { id: secondOfferId },
          data: { priceAmountMinor: original.priceAmountMinor },
        });
      }
    });

    it('survives the product being withdrawn from sale entirely', async () => {
      const checkout = await readyCheckout([{ offerId: secondOfferId, quantity: 1 }]);
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('withdraw'))
        .expect(201);

      await prisma.offer.update({ where: { id: secondOfferId }, data: { active: false } });
      try {
        const reread = await request(app.getHttpServer())
          .get(`/api/v1/orders/${created.body.id}`)
          .set('Cookie', checkout.cookie)
          .expect(200);

        expect(reread.body.items).toHaveLength(1);
        expect(reread.body.totals.total.amountMinor).toBe(created.body.totals.total.amountMinor);
      } finally {
        await prisma.offer.update({ where: { id: secondOfferId }, data: { active: true } });
      }
    });

    it('keeps its own copy of the pricing, not a pointer to the catalog', async () => {
      const checkout = await readyCheckout();
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('snapshot'))
        .expect(201);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
      const snapshot = row.pricingSnapshot as Record<string, unknown>;

      expect(snapshot['totalMinor']).toBe(row.totalMinor);
      expect(Array.isArray(snapshot['lines'])).toBe(true);
      expect((snapshot['lines'] as unknown[]).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('ownership survives order creation', () => {
    it('refuses to create an order from someone else\'s checkout', async () => {
      const checkout = await readyCheckout();
      const stranger = await readyCheckout();

      const response = await post(
        '/orders',
        { checkoutSessionId: checkout.id },
        stranger.cookie,
        key('foreign'),
      );

      expect(response.status).toBe(404);
      expect(await prisma.order.count({ where: { checkoutSessionId: checkout.id } })).toBe(0);
    });

    it('refuses a caller with no session at all', async () => {
      const checkout = await readyCheckout();

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Idempotency-Key', key('nosession'))
        .send({ checkoutSessionId: checkout.id });

      expect(response.status).toBe(404);
    });

    it('gives the new order to the session that placed it, and to nobody else', async () => {
      const checkout = await readyCheckout();
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('own'))
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${created.body.id}`)
        .set('Cookie', checkout.cookie)
        .expect(200);

      const stranger = await readyCheckout();
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${created.body.id}`)
        .set('Cookie', stranger.cookie)
        .expect(404);

      await request(app.getHttpServer()).get(`/api/v1/orders/${created.body.id}`).expect(404);
    });

    it('follows the customer when a guest signs in afterwards', async () => {
      const checkout = await readyCheckout();
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('claim'))
        .expect(201);

      const address = email();
      const requested = await post('/auth/request-code', { email: address }, checkout.cookie).expect(204);
      const verified = await post(
        '/auth/verify-code',
        { email: address, code: requested.headers['x-dev-otp'] },
        checkout.cookie,
      ).expect(200);
      const signedInCookie = verified.headers['set-cookie'][0].split(';')[0];

      // Sign-in rotates the session; the order must move with the customer.
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${created.body.id}`)
        .set('Cookie', signedInCookie)
        .expect(200);
    });

    it('does not put the order in a stranger\'s history', async () => {
      const checkout = await readyCheckout();
      const created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('list'))
        .expect(201);

      const stranger = await readyCheckout();
      const listed = await request(app.getHttpServer())
        .get('/api/v1/account/orders')
        .set('Cookie', stranger.cookie)
        .expect(200);

      const ids = listed.body.items.map((order: { id: string }) => order.id);
      expect(ids).not.toContain(created.body.id);
    });
  });

  // -------------------------------------------------------------------------
  describe('observability', () => {
    it('answers with a correlation id that a client can quote back', async () => {
      const checkout = await readyCheckout();
      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('trace'))
        .expect(201);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('writes a traceable order event without any sensitive value in it', async () => {
      const checkout = await readyCheckout();

      // Capture what the process actually writes, rather than trusting the
      // redaction unit test to describe production behaviour.
      const written: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      (process.stdout.write as unknown as (chunk: string) => boolean) = ((chunk: string) => {
        written.push(String(chunk));
        return true;
      }) as never;

      let created: request.Response;
      try {
        created = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('logs'))
          .expect(201);
      } finally {
        process.stdout.write = original;
      }

      const logs = written.join('');
      const sessionToken = checkout.cookie.split('=')[1];

      // The event exists and can be tied back to the order.
      expect(logs).toContain('order created');
      expect(logs).toContain(created.body.id);
      expect(logs).toContain(checkout.id);

      // And carries nothing that could be replayed or that identifies a person.
      expect(logs).not.toContain(sessionToken);
      expect(logs).not.toContain('buyer@example.com');
      expect(logs).not.toMatch(/tt_session=/);
      expect(logs).not.toMatch(/"(password|cvv|cardNumber)"/i);
    });

    it('never returns a stack trace or a database error when creation fails', async () => {
      const checkout = await readyCheckout();
      // Internally consistent (total = subtotal - discount, so the CHECK
      // constraint allows the write) but disagreeing with the lines it holds.
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { subtotalMinor: 7, discountMinor: 0, totalMinor: 7 },
      });

      const response = await post('/orders', { checkoutSessionId: checkout.id }, checkout.cookie, key('leak'));
      expect(response.status).toBe(409);
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/prisma|postgres|at Object|\.ts:\d+/i);
    });
  });
});
