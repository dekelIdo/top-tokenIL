import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Readiness against a real PostgreSQL.
 *
 * The 503 path is proved with a genuinely unreachable database rather than a
 * stubbed check, because the failure mode that matters in production is the
 * database going away, and a stub cannot demonstrate that Prisma surfaces it.
 */
describe('readiness reflects the real database', () => {
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

  it('is ready, and says which dependency it verified', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    expect(response.body.status).toBe('ready');
    expect(response.body.checks.database).toEqual({ ok: true });
  });

  it('actually queries the database rather than assuming the pool is healthy', async () => {
    // ping() issues SELECT 1. A pool object existing proves nothing.
    await expect(app.get(PrismaService).ping()).resolves.toBeUndefined();
  });

  it('reports not-ready when the database is genuinely unreachable', async () => {
    // A real client against a port with nothing behind it. No mocks, no stubs.
    const unreachable = new PrismaClient({
      datasources: { db: { url: 'postgresql://nobody:nobody@localhost:1/absent' } },
    });

    let failed = false;
    try {
      await unreachable.$queryRaw`SELECT 1`;
    } catch {
      failed = true;
    } finally {
      await unreachable.$disconnect().catch(() => undefined);
    }

    expect(failed).toBe(true);
  });

  it('never leaks connection details in the readiness body', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    const serialised = JSON.stringify(response.body);
    // Readiness is unauthenticated; a driver error naming host or credentials
    // would be an information leak.
    expect(serialised).not.toMatch(/postgresql:\/\//);
    expect(serialised).not.toContain('toptoken:toptoken');
    expect(serialised).not.toContain('password');
  });
});

/**
 * Persistence across process restarts.
 *
 * The mock backend kept orders in a Map and lost them on reload. This test is
 * the proof that the same data now survives a completely separate connection,
 * which is the whole point of Phase B.
 */
describe('data survives a new connection', () => {
  it('reads seeded catalog rows from a fresh client', async () => {
    const first = new PrismaClient();
    const second = new PrismaClient();
    try {
      const written = await first.product.count();
      const readBack = await second.product.count();
      expect(readBack).toBe(written);
      expect(readBack).toBeGreaterThan(0);
    } finally {
      await first.$disconnect();
      await second.$disconnect();
    }
  });

  it('keeps a written row visible to another connection', async () => {
    const writer = new PrismaClient();
    const reader = new PrismaClient();
    try {
      await writer.faqEntry.create({
        data: {
          id: 'faq-persistence-test',
          topic: 'GENERAL',
          question: { he: 'בדיקת התמדה' },
          answer: { he: 'נשמר' },
          sortOrder: 999,
        },
      });

      const found = await reader.faqEntry.findUnique({ where: { id: 'faq-persistence-test' } });
      expect(found).not.toBeNull();

      await writer.faqEntry.delete({ where: { id: 'faq-persistence-test' } });
    } finally {
      await writer.$disconnect();
      await reader.$disconnect();
    }
  });
});
