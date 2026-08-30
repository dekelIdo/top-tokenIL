import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { HousekeepingService } from '../../src/modules/housekeeping/housekeeping.service';
import { SandboxPaymentProvider } from '../../src/modules/payments/providers/sandbox-payment.provider';

/**
 * Payments, webhooks and the reservation lifecycle, against real PostgreSQL.
 *
 * The properties that matter most:
 *
 * 1. Only the backend can decide an order is paid.
 * 2. A duplicate webhook, however it arrives, applies once.
 * 3. Settlement and expiry cannot both win.
 * 4. Stock is never committed without payment, nor released after payment.
 */
describe('payment lifecycle', () => {
  let app: NestExpressApplication;
  let provider: SandboxPaymentProvider;
  let housekeeping: HousekeepingService;
  const prisma = new PrismaClient();

  let offerId: string;
  let secondOfferId: string;

  const key = (label: string) => `order-create:${label}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    // Off during tests: sweeps are triggered explicitly so a timer cannot fire
    // in the middle of an assertion.
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';

    app = await createApp();
    await app.init();
    provider = app.get(SandboxPaymentProvider);
    housekeeping = app.get(HousekeepingService);
    await prisma.$connect();

    const offers = await prisma.offer.findMany({
      where: { active: true, inventory: { status: 'IN_STOCK' } },
      orderBy: { id: 'asc' },
      take: 2,
    });
    offerId = offers[0].id;
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
    if (cookie) call = call.set('Cookie', cookie);
    if (idempotencyKey) call = call.set('Idempotency-Key', idempotencyKey);
    return call;
  };

  /** Drives checkout to an order, ready for payment. */
  async function placedOrder(
    items: { offerId: string; quantity: number }[] = [{ offerId, quantity: 1 }],
  ): Promise<{ orderId: string; checkoutId: string; cookie: string; totalMinor: number }> {
    const created = await post('/checkout/sessions', { items }).expect(201);
    const cookie = created.headers['set-cookie'][0].split(';')[0];

    const values: Record<string, string | boolean> = {};
    for (const requirement of created.body.requirements) {
      if (!requirement.required) continue;
      values[requirement.key] =
        requirement.control === 'checkbox'
          ? true
          : requirement.key === 'EMAIL'
            ? 'buyer@example.com'
            : requirement.options?.length
              ? requirement.options[0].value
              : 'Test Value';
    }
    await post(`/checkout/sessions/${created.body.id}/validate`, { values }, cookie).expect(200);

    const order = await post('/orders', { checkoutSessionId: created.body.id }, cookie, key('pay'))
      .expect(201);

    return {
      orderId: order.body.id,
      checkoutId: created.body.id,
      cookie,
      totalMinor: order.body.totals.total.amountMinor,
    };
  }

  async function openIntent(checkoutId: string, cookie: string) {
    const response = await post('/payment/intents', { checkoutSessionId: checkoutId }, cookie)
      .expect(201);
    return response.body.intent;
  }

  /** Sends a webhook the way the provider would, signed over the raw body. */
  function deliver(
    payload: object,
    options: { timestamp?: string; signature?: string } = {},
  ) {
    // Sent as a string, not a Buffer: superagent JSON-encodes a Buffer into
    // {"type":"Buffer","data":[...]}, so the bytes on the wire would not be the
    // bytes that were signed.
    const body = JSON.stringify(payload);
    const raw = Buffer.from(body, 'utf8');
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString();
    const signature = options.signature ?? provider.sign(raw, timestamp);

    return request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-TT-Timestamp', timestamp)
      .set('X-TT-Signature', signature)
      .send(body);
  }

  function paidEvent(providerIntentId: string, eventId = `evt_${Math.random().toString(36).slice(2)}`) {
    return {
      id: eventId,
      type: 'payment.succeeded',
      occurredAt: new Date().toISOString(),
      data: { intentId: providerIntentId, status: 'SUCCEEDED' },
    };
  }

  async function withStock<T>(target: string, available: number, body: () => Promise<T>): Promise<T> {
    const before = await prisma.inventory.findUniqueOrThrow({ where: { offerId: target } });
    await prisma.inventory.update({
      where: { offerId: target },
      data: { quantityAvailable: available, quantityReserved: 0, status: 'IN_STOCK' },
    });
    try {
      return await body();
    } finally {
      await prisma.inventoryReservation.deleteMany({ where: { offerId: target } });
      await prisma.inventory.update({
        where: { offerId: target },
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
  describe('payment intents', () => {
    it('opens one for an order awaiting payment', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      expect(intent.id).toMatch(/^pi_/);
      expect(intent.status).toBe('CREATED');
      expect(intent.amount.amountMinor).toBe(order.totalMinor);
      expect(intent.orderId).toBe(order.orderId);
    });

    it('takes the amount from the order, not from the request', async () => {
      const order = await placedOrder();
      const response = await post(
        '/payment/intents',
        { checkoutSessionId: order.checkoutId, amountMinor: 1 },
        order.cookie,
      );

      // An amount is not a field a client may send at all.
      expect(response.status).toBe(422);
    });

    it('returns the existing intent instead of opening a second one', async () => {
      const order = await placedOrder();
      const first = await openIntent(order.checkoutId, order.cookie);
      const second = await openIntent(order.checkoutId, order.cookie);

      expect(second.id).toBe(first.id);
      expect(await prisma.paymentIntent.count({ where: { orderId: order.orderId } })).toBe(1);
    });

    it('opens exactly one intent for five simultaneous requests', async () => {
      const order = await placedOrder();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          post('/payment/intents', { checkoutSessionId: order.checkoutId }, order.cookie),
        ),
      );

      const live = await prisma.paymentIntent.count({
        where: { orderId: order.orderId, status: { in: ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'] } },
      });

      expect(live).toBe(1);
      const ids = new Set(responses.filter((r) => r.status === 201).map((r) => r.body.intent.id));
      expect(ids.size).toBe(1);
    });

    it('offers only the simulated provider, labelled as a simulation', async () => {
      const order = await placedOrder();
      const response = await post('/payment/intents', { checkoutSessionId: order.checkoutId }, order.cookie)
        .expect(201);

      expect(response.body.availableProviders).toHaveLength(1);
      expect(response.body.availableProviders[0].simulated).toBe(true);
      expect(JSON.stringify(response.body)).not.toMatch(/cardNumber|cvv|pan\b/i);
    });

    it('refuses to open a payment for an order that is already paid', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
        .expect(200);

      const again = await post('/payment/intents', { checkoutSessionId: order.checkoutId }, order.cookie);

      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ORDER_ALREADY_PAID');
    });
  });

  // -------------------------------------------------------------------------
  describe('confirming a payment', () => {
    it('marks the order paid and commits its stock', async () => {
      await withStock(secondOfferId, 5, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);

        const result = await post(
          `/payment/intents/${intent.id}/confirm`,
          { instrument: { token: 'sim_success' } },
          order.cookie,
        ).expect(200);

        expect(result.body.status).toBe('SUCCEEDED');

        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        const reservations = await prisma.inventoryReservation.findMany({
          where: { orderId: order.orderId },
        });

        expect(row.status).toBe('FULFILLMENT_PENDING');
        expect(reservations.every((r) => r.status === 'COMMITTED')).toBe(true);
        expect(inventory.quantitySold).toBe(2);
        expect(inventory.quantityReserved).toBe(0);
      });
    });

    it('opens a pending fulfillment per item and invents no delivered code', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
        .expect(200);

      const fulfillments = await prisma.fulfillment.findMany({ where: { orderId: order.orderId } });

      expect(fulfillments.length).toBeGreaterThan(0);
      expect(fulfillments.every((f) => f.status === 'PENDING')).toBe(true);
      expect(fulfillments.every((f) => f.deliveryPayload === null)).toBe(true);
      expect(fulfillments.every((f) => f.deliveredAt === null)).toBe(true);
    });

    it('leaves a declined order payable, holding its stock for a retry', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      const result = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_declined' } },
        order.cookie,
      ).expect(200);

      expect(result.body.status).toBe('FAILED');
      expect(result.body.failureReason.he).toContain('נדחה');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      const reservations = await prisma.inventoryReservation.findMany({ where: { orderId: order.orderId } });

      expect(row.status).toBe('PENDING_PAYMENT');
      expect(reservations.every((r) => r.status === 'HELD')).toBe(true);
    });

    it('lets a customer retry after a decline', async () => {
      const order = await placedOrder();
      const first = await openIntent(order.checkoutId, order.cookie);
      await post(`/payment/intents/${first.id}/confirm`, { instrument: { token: 'sim_declined' } }, order.cookie)
        .expect(200);

      const second = await openIntent(order.checkoutId, order.cookie);
      expect(second.id).not.toBe(first.id);

      await post(`/payment/intents/${second.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
        .expect(200);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('FULFILLMENT_PENDING');
    });

    it('cancels the order and returns the stock when the customer cancels', async () => {
      await withStock(secondOfferId, 4, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 3 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);

        await post(`/payment/intents/${intent.id}/cancel`, {}, order.cookie).expect(200);

        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });

        expect(row.status).toBe('CANCELLED');
        expect(inventory.quantityReserved).toBe(0);
        expect(inventory.quantitySold).toBe(0);
      });
    });

    it('leaves a slow payment processing rather than guessing', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      const result = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_timeout' } },
        order.cookie,
      ).expect(200);

      expect(result.body.status).toBe('PROCESSING');

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('PAYMENT_PROCESSING');
    });

    it('fails an unknown instrument rather than defaulting to success', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      const result = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'not_a_real_instrument' } },
        order.cookie,
      ).expect(200);

      expect(result.body.status).toBe('FAILED');
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('PENDING_PAYMENT');
    });

    it('refuses to confirm a payment that already settled', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
        .expect(200);

      const again = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_success' } },
        order.cookie,
      );

      expect(again.status).toBe(409);
      expect(again.body.code).toBe('INTENT_NOT_CONFIRMABLE');
    });

    it('rejects a card number sent in the instrument', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      const response = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_success', cardNumber: '4111111111111111', cvv: '123' } },
        order.cookie,
      );

      expect(response.status).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  describe('the browser cannot declare an outcome', () => {
    it('ignores a status sent with the confirm request', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      const response = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_declined' }, status: 'SUCCEEDED' },
        order.cookie,
      );

      // Rejected outright rather than ignored.
      expect(response.status).toBe(422);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('PENDING_PAYMENT');
    });

    it('has no endpoint that marks an order paid', async () => {
      const order = await placedOrder();

      const attempts = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/orders/${order.orderId}`)
          .set('Cookie', order.cookie)
          .send({ status: 'PAID' }),
        post(`/orders/${order.orderId}/pay`, {}, order.cookie),
      ]);

      expect(attempts.every((response) => response.status === 404 || response.status === 405)).toBe(true);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('PENDING_PAYMENT');
    });

    it('refuses a payment belonging to another session', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const stranger = await placedOrder();

      const read = await request(app.getHttpServer())
        .get(`/api/v1/payment/intents/${intent.id}`)
        .set('Cookie', stranger.cookie);
      const confirm = await post(
        `/payment/intents/${intent.id}/confirm`,
        { instrument: { token: 'sim_success' } },
        stranger.cookie,
      );

      expect(read.status).toBe(404);
      expect(confirm.status).toBe(404);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(row.status).toBe('PENDING_PAYMENT');
    });

    it('refuses a payment to a caller with no session', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);

      await request(app.getHttpServer()).get(`/api/v1/payment/intents/${intent.id}`).expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('webhooks', () => {
    it('applies a correctly signed event', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const response = await deliver(paidEvent(row.providerIntentId!)).expect(200);
      expect(response.body.applied).toBe(true);

      const order_ = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(order_.status).toBe('FULFILLMENT_PENDING');
    });

    it('rejects a forged signature', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const response = await deliver(paidEvent(row.providerIntentId!), {
        signature: 'f'.repeat(64),
      });

      expect(response.status).toBe(401);
      const order_ = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(order_.status).toBe('PENDING_PAYMENT');
    });

    it('rejects an unsigned delivery', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const response = await request(app.getHttpServer())
        .post('/api/v1/webhooks/payments/mock')
        .send(paidEvent(row.providerIntentId!));

      expect(response.status).toBe(401);
    });

    it('rejects an event whose body was altered after signing', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const honest = paidEvent(row.providerIntentId!);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.sign(Buffer.from(JSON.stringify(honest), 'utf8'), timestamp);

      // Same signature, different body.
      const tampered = { ...honest, data: { ...honest.data, status: 'SUCCEEDED', intentId: 'sbx_other' } };

      const response = await request(app.getHttpServer())
        .post('/api/v1/webhooks/payments/mock')
        .set('Content-Type', 'application/json')
        .set('X-TT-Timestamp', timestamp)
        .set('X-TT-Signature', signature)
        .send(JSON.stringify(tampered));

      expect(response.status).toBe(401);
    });

    it('rejects a stale delivery, which is what a captured replay looks like', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const oldTimestamp = (Math.floor(Date.now() / 1000) - 3600).toString();
      const response = await deliver(paidEvent(row.providerIntentId!), { timestamp: oldTimestamp });

      expect(response.status).toBe(401);
      const order_ = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(order_.status).toBe('PENDING_PAYMENT');
    });

    it('applies a duplicated event exactly once', async () => {
      await withStock(secondOfferId, 5, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);
        const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

        const event = paidEvent(row.providerIntentId!);
        const first = await deliver(event).expect(200);
        const second = await deliver(event).expect(200);

        expect(first.body.applied).toBe(true);
        expect(second.body.applied).toBe(false);
        expect(second.body.duplicate).toBe(true);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        // Applied twice, this would read 4.
        expect(inventory.quantitySold).toBe(2);
      });
    });

    it('applies concurrent duplicate deliveries exactly once', async () => {
      await withStock(secondOfferId, 6, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 3 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);
        const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

        const event = paidEvent(row.providerIntentId!);
        const responses = await Promise.all([deliver(event), deliver(event), deliver(event)]);

        const applied = responses.filter((response) => response.body.applied === true);
        expect(applied).toHaveLength(1);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantitySold).toBe(3);
        expect(inventory.quantityReserved).toBe(0);

        const events = await prisma.paymentEvent.count({ where: { paymentIntentId: intent.id } });
        expect(events).toBe(1);
      });
    });

    it('changes nothing when an event arrives for an order already settled', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
        .expect(200);
      const before = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });

      // A different event id, so it is not caught by deduplication: the state
      // machine itself has to refuse to apply it twice.
      const response = await deliver(paidEvent(row.providerIntentId!, `evt_late_${Math.random()}`)).expect(200);
      expect(response.body.applied).toBe(false);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(after.status).toBe(before.status);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });

    it('acknowledges an event for an intent it does not know', async () => {
      const response = await deliver({
        id: `evt_${Math.random()}`,
        type: 'payment.succeeded',
        occurredAt: new Date().toISOString(),
        data: { intentId: 'sbx_never_seen', status: 'SUCCEEDED' },
      }).expect(200);

      expect(response.body.applied).toBe(false);
    });

    it('rejects a malformed payload', async () => {
      const response = await deliver({ nonsense: true });
      expect(response.status).toBe(401);
    });

    it('rejects an unknown provider', async () => {
      const body = JSON.stringify({ id: 'x' });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const response = await request(app.getHttpServer())
        .post('/api/v1/webhooks/payments/stripe')
        .set('Content-Type', 'application/json')
        .set('X-TT-Timestamp', timestamp)
        .set('X-TT-Signature', provider.sign(Buffer.from(body, 'utf8'), timestamp))
        .send(body);

      expect(response.status).toBe(400);
    });

    it('stores only recognised fields, never the raw provider payload', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const event = {
        ...paidEvent(row.providerIntentId!),
        data: {
          intentId: row.providerIntentId,
          status: 'SUCCEEDED',
          cardNumber: '4111111111111111',
          customerEmail: 'someone@example.com',
        },
      };
      await deliver(event).expect(200);

      const stored = await prisma.paymentEvent.findFirstOrThrow({
        where: { paymentIntentId: intent.id },
      });
      const payload = JSON.stringify(stored.payloadRedacted);

      expect(payload).not.toContain('4111111111111111');
      expect(payload).not.toContain('someone@example.com');
    });

    it('never writes the webhook secret to a log', async () => {
      const order = await placedOrder();
      const intent = await openIntent(order.checkoutId, order.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

      const written: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      (process.stdout.write as unknown as (chunk: string) => boolean) = ((chunk: string) => {
        written.push(String(chunk));
        return true;
      }) as never;

      try {
        await deliver(paidEvent(row.providerIntentId!));
        await deliver(paidEvent(row.providerIntentId!), { signature: 'f'.repeat(64) });
      } finally {
        process.stdout.write = original;
      }

      const logs = written.join('');
      expect(logs).not.toContain('development-only-webhook-secret');
      expect(logs).not.toMatch(/x-tt-signature/i);
    });
  });

  // -------------------------------------------------------------------------
  describe('the reservation lifecycle', () => {
    it('releases a hold when its deadline passes', async () => {
      await withStock(secondOfferId, 3, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);

        await prisma.inventoryReservation.updateMany({
          where: { orderId: order.orderId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        const result = await housekeeping.sweep();
        expect(result.reservationsReleased).toBeGreaterThanOrEqual(1);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantityReserved).toBe(0);
      });
    });

    it('is safe to sweep twice: the stock comes back once', async () => {
      await withStock(secondOfferId, 3, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
        await prisma.inventoryReservation.updateMany({
          where: { orderId: order.orderId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        await housekeeping.sweep();
        await housekeeping.sweep();

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantityReserved).toBe(0);
        expect(inventory.quantityAvailable).toBe(3);
      });
    });

    it('is safe when two sweeps run at the same time', async () => {
      await withStock(secondOfferId, 8, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 5 }]);
        await prisma.inventoryReservation.updateMany({
          where: { orderId: order.orderId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        const [a, b] = await Promise.all([housekeeping.sweep(), housekeeping.sweep()]);

        // Between them they release each reservation once, never twice.
        expect(a.reservationsReleased + b.reservationsReleased).toBe(1);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantityReserved).toBe(0);
      });
    });

    it('never releases stock that was already committed', async () => {
      await withStock(secondOfferId, 5, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);
        await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token: 'sim_success' } }, order.cookie)
          .expect(200);

        // Backdate them anyway: a committed reservation must be untouchable.
        await prisma.inventoryReservation.updateMany({
          where: { orderId: order.orderId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });

        await housekeeping.sweep();

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        const reservations = await prisma.inventoryReservation.findMany({ where: { orderId: order.orderId } });

        expect(reservations.every((r) => r.status === 'COMMITTED')).toBe(true);
        expect(inventory.quantitySold).toBe(2);
        expect(inventory.quantityReserved).toBe(0);
      });
    });

    it('never commits stock that was already released', async () => {
      await withStock(secondOfferId, 4, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);

        // Cancel, which releases, then try to settle the same intent as paid.
        await post(`/payment/intents/${intent.id}/cancel`, {}, order.cookie).expect(200);

        const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
        await deliver(paidEvent(row.providerIntentId!)).expect(200);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        const reservations = await prisma.inventoryReservation.findMany({ where: { orderId: order.orderId } });

        expect(reservations.every((r) => r.status === 'RELEASED')).toBe(true);
        expect(inventory.quantitySold).toBe(0);
        expect(inventory.quantityReserved).toBe(0);
      });
    });

    it('cancels an order whose payment was never completed', async () => {
      await withStock(secondOfferId, 3, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 1 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);

        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
        });

        const result = await housekeeping.sweep();
        expect(result.paymentsExpired).toBeGreaterThanOrEqual(1);

        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });

        expect(row.status).toBe('CANCELLED');
        expect(inventory.quantityReserved).toBe(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('settlement racing expiration', () => {
    /**
     * The case that would hurt most in production: a customer's payment lands at
     * the same moment housekeeping decides their order is abandoned. Exactly one
     * outcome must win, and the stock must agree with it.
     */
    it('produces one coherent outcome, never paid-and-released', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await withStock(secondOfferId, 4, async () => {
          const order = await placedOrder([{ offerId: secondOfferId, quantity: 2 }]);
          const intent = await openIntent(order.checkoutId, order.cookie);
          const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

          // Make the payment eligible for expiry right now, then fire the
          // webhook and the sweep together over separate connections.
          await prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
          });

          await Promise.all([
            deliver(paidEvent(row.providerIntentId!)),
            housekeeping.sweep(),
          ]);

          const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
          const finalIntent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
          const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
          const reservations = await prisma.inventoryReservation.findMany({
            where: { orderId: order.orderId },
          });

          // Whatever happened, the books must balance.
          expect(inventory.quantityReserved).toBeGreaterThanOrEqual(0);
          expect(inventory.quantitySold).toBeGreaterThanOrEqual(0);
          expect(inventory.quantityReserved).toBeLessThanOrEqual(inventory.quantityAvailable ?? Infinity);
          expect(reservations.every((r) => r.status !== 'HELD')).toBe(true);

          if (finalOrder.status === 'FULFILLMENT_PENDING') {
            // Payment won: stock is sold, nothing was released.
            expect(finalIntent.status).toBe('SUCCEEDED');
            expect(reservations.every((r) => r.status === 'COMMITTED')).toBe(true);
            expect(inventory.quantitySold).toBe(2);
            expect(inventory.quantityReserved).toBe(0);
          } else {
            // Expiry won: the order is closed and the stock went back. If the
            // payment still succeeded, it is flagged for a refund rather than
            // being silently kept.
            expect(['CANCELLED', 'REFUND_PENDING']).toContain(finalOrder.status);
            expect(reservations.every((r) => ['RELEASED', 'EXPIRED'].includes(r.status))).toBe(true);
            expect(inventory.quantitySold).toBe(0);
            expect(inventory.quantityReserved).toBe(0);

            if (finalIntent.status === 'SUCCEEDED') {
              // Money taken with no stock behind it must be visible, not lost.
              expect(finalOrder.status).toBe('REFUND_PENDING');
            }
          }

          // The forbidden combination, stated directly.
          const paidButReleased =
            finalOrder.status === 'FULFILLMENT_PENDING' &&
            reservations.some((r) => ['RELEASED', 'EXPIRED'].includes(r.status));
          expect(paidButReleased).toBe(false);

          const unpaidButCommitted =
            finalIntent.status !== 'SUCCEEDED' &&
            reservations.some((r) => r.status === 'COMMITTED');
          expect(unpaidButCommitted).toBe(false);
        });
      }
    });

    it('never lets two settlements commit the same stock twice', async () => {
      await withStock(secondOfferId, 6, async () => {
        const order = await placedOrder([{ offerId: secondOfferId, quantity: 3 }]);
        const intent = await openIntent(order.checkoutId, order.cookie);
        const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });

        // Two distinct events for the same intent, delivered together.
        await Promise.all([
          deliver(paidEvent(row.providerIntentId!, `evt_a_${Math.random()}`)),
          deliver(paidEvent(row.providerIntentId!, `evt_b_${Math.random()}`)),
        ]);

        const inventory = await prisma.inventory.findUniqueOrThrow({ where: { offerId: secondOfferId } });
        expect(inventory.quantitySold).toBe(3);
        expect(inventory.quantityReserved).toBe(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('order state consistency', () => {
    it('never holds a combination the state machine forbids', async () => {
      const orders = await prisma.order.findMany({
        include: { paymentIntents: true, reservations: true },
        take: 200,
      });

      for (const order of orders) {
        const succeeded = order.paymentIntents.some((intent) => intent.status === 'SUCCEEDED');
        const committed = order.reservations.some((r) => r.status === 'COMMITTED');

        if (committed) {
          // Stock only leaves the shelf against a payment that succeeded.
          expect(succeeded).toBe(true);
        }

        if (order.status === 'FULFILLMENT_PENDING' || order.status === 'PAID') {
          expect(succeeded).toBe(true);
          expect(order.reservations.every((r) => r.status !== 'HELD')).toBe(true);
        }

        if (order.status === 'CANCELLED') {
          expect(order.reservations.every((r) => r.status !== 'COMMITTED')).toBe(true);
        }

        // One live payment at most, enforced by a partial unique index.
        const live = order.paymentIntents.filter((intent) =>
          ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'].includes(intent.status),
        );
        expect(live.length).toBeLessThanOrEqual(1);
      }
    });

    it('keeps inventory arithmetic non-negative everywhere', async () => {
      const rows = await prisma.inventory.findMany();
      for (const row of rows) {
        expect(row.quantityReserved).toBeGreaterThanOrEqual(0);
        expect(row.quantitySold).toBeGreaterThanOrEqual(0);
        if (row.quantityAvailable !== null) {
          expect(row.quantityAvailable).toBeGreaterThanOrEqual(0);
          expect(row.quantityReserved).toBeLessThanOrEqual(row.quantityAvailable);
        }
      }
    });
  });
});
