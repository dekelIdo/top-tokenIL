import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';

/**
 * The housekeeping cron endpoint.
 *
 * On a serverless host the sweep is not run by an in-process timer but by a
 * scheduler calling this endpoint. The properties that matter: it does the same
 * work as the timer, and it is reachable by nobody without the shared secret.
 */
describe('the housekeeping cron endpoint', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  const SECRET = 'test-cron-secret-0123456789abcdef0123456789abcdef';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.CRON_SECRET = SECRET;
    // The in-process timer is off; the endpoint is the trigger under test.
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';

    app = await createApp();
    await app.init();
    await prisma.$connect();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    delete process.env.CRON_SECRET;
  });

  const get = (auth?: string) => {
    const call = request(app.getHttpServer()).get('/api/v1/internal/housekeeping');
    return auth ? call.set('Authorization', auth) : call;
  };

  it('rejects a request with no secret', async () => {
    await get().expect(401);
  });

  it('rejects a wrong secret', async () => {
    await get('Bearer not-the-real-secret-but-long-enough-to-compare').expect(401);
  });

  it('rejects a secret that is a prefix of the real one', async () => {
    await get(`Bearer ${SECRET.slice(0, -1)}`).expect(401);
  });

  it('runs the sweep with the right secret and reports what it touched', async () => {
    const response = await get(`Bearer ${SECRET}`).expect(200);

    expect(response.body.ok).toBe(true);
    // The sweep result fields are present even when everything is zero, so a
    // monitor can watch them.
    expect(response.body).toHaveProperty('reservationsReleased');
    expect(response.body).toHaveProperty('paymentsExpired');
    expect(response.body).toHaveProperty('checkoutsExpired');
  });
});

/**
 * With no secret configured the endpoint must not exist, rather than run
 * unauthenticated. Runs in its own app because the secret is read at
 * construction from configuration.
 */
describe('the housekeeping cron endpoint with no secret configured', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    delete process.env.CRON_SECRET;
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';

    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports not-found rather than running unauthenticated', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/internal/housekeeping')
      .set('Authorization', 'Bearer anything')
      .expect(404);
  });
});
