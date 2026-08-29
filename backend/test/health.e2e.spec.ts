import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../src/main';
import { ReadinessRegistry } from '../src/modules/health/readiness.registry';

/**
 * End-to-end against a genuinely running Nest application.
 *
 * This is the Phase A acceptance gate: not "TypeScript compiles" but "the
 * server boots, routes are mounted under the versioned prefix, and the error
 * contract the Angular client parses is actually what comes back".
 *
 * One application instance for the whole file. Building two and closing both
 * left the second close hanging, and a single instance is closer to how the
 * service actually runs.
 */
describe('backend HTTP surface', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  // -------------------------------------------------------------------------
  describe('health and readiness', () => {
    it('serves liveness at the versioned path', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptimeSeconds).toBe('number');
    });

    it('serves readiness at the versioned path', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
      expect(response.body.status).toBe('ready');
    });

    it('performs a real database check rather than reporting a bare "ok"', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
      // Readiness means "can serve traffic", which since Phase B includes
      // reaching PostgreSQL. A green tick with no check behind it would be worse
      // than no endpoint at all.
      expect(response.body.checks.database).toEqual({ ok: true });
    });

    it('does not mount routes outside the /api/v1 prefix', async () => {
      await request(app.getHttpServer()).get('/health').expect(404);
    });
  });

  // -------------------------------------------------------------------------
  describe('API error contract (what the Angular mapper parses)', () => {
    it('returns the documented envelope for an unknown route', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .expect(404);

      // Exactly the fields src/app/data/http/http-error.mapper.ts reads.
      expect(response.body.kind).toBe('NOT_FOUND');
      expect(typeof response.body.code).toBe('string');
      expect(typeof response.body.message).toBe('string');
      expect(typeof response.body.userMessage.he).toBe('string');
      expect(response.body.userMessage.he.length).toBeGreaterThan(5);
      expect(typeof response.body.retryable).toBe('boolean');
    });

    it('never returns a Nest-shaped error body', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .expect(404);
      // Nest's default is { statusCode, message, error }. Ours must not look like it.
      expect(response.body.statusCode).toBeUndefined();
      expect(response.body.error).toBeUndefined();
    });

    it('never leaks a stack trace to the customer', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .expect(404);
      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toMatch(/\bat \w+.*:\d+:\d+/);
      expect(response.body.stack).toBeUndefined();
    });

    it('rejects an oversized request body as 413, not 500', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/does-not-exist')
        .send({ blob: 'x'.repeat(200_000) });

      expect(response.status).toBe(413);
      expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
      expect(response.body.userMessage?.he).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('correlation', () => {
    it('echoes a client-supplied correlation id into the header and the error body', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .set('X-Request-Id', 'req-abc-123')
        .expect(404);

      expect(response.headers['x-request-id']).toBe('req-abc-123');
      expect(response.body.correlationId).toBe('req-abc-123');
    });

    it('mints a correlation id when the client sends none', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('replaces an over-long correlation id rather than echoing it', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-Id', 'x'.repeat(500))
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('replaces a correlation id containing punctuation used for log forging', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-Id', 'evil","level":"error')
        .expect(200);

      expect(response.headers['x-request-id']).not.toContain('level');
    });
  });

  // -------------------------------------------------------------------------
  describe('security headers and CORS', () => {
    it('sets security headers and hides the framework', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('rejects a cross-origin request from an origin outside the allowlist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://attacker.example')
        .expect(200);

      // No allow-origin header means the browser blocks the response.
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows an allowlisted origin, with credentials', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:4200')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('never answers with a wildcard origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:4200')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  // -------------------------------------------------------------------------
  describe('readiness with a failing dependency', () => {
    // Registered last: it mutates shared state, so it must not affect the tests
    // above that assert a healthy service.
    it('returns 503 when a registered dependency is unavailable', async () => {
      app.get(ReadinessRegistry).register({
        name: 'stub-dependency',
        check: async () => ({ ok: false, detail: 'simulated outage' }),
      });

      const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(503);
      expect(response.body.status).toBe('not-ready');
      expect(response.body.checks['stub-dependency'].ok).toBe(false);
    });
  });
});
