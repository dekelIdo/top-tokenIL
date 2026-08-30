import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { hashSessionToken } from '../../src/common/crypto/tokens';

/**
 * Authentication and session security, against a running server and a real
 * PostgreSQL.
 *
 * Every assertion here is about a property an attacker would try to break, not
 * about whether the happy path returns 200.
 */
describe('authentication and sessions', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  /** Unique per run so repeated runs never collide on the email unique index. */
  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    app = await createApp();
    await app.init();
    await prisma.$connect();

  });

  /**
   * Rate limit counters live in PostgreSQL and are shared by every request from
   * this address, which is exactly what production wants and exactly what makes
   * a test suite trip over itself. Each test starts with a clean budget so it
   * exercises what it claims to; the limiter has its own test that deliberately
   * spends one.
   */
  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  /** Requests a code and returns it via the development echo header. */
  async function requestCode(address: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ email: address })
      .expect(204);
    return response.headers['x-dev-otp'];
  }

  /** Signs in and returns the Set-Cookie value for reuse. */
  async function signIn(address: string): Promise<string> {
    const code = await requestCode(address);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ email: address, code })
      .expect(200);
    const cookie = response.headers['set-cookie'][0];
    return cookie.split(';')[0];
  }

  // -------------------------------------------------------------------------
  describe('sign-in code issuance', () => {
    it('always answers 204, so a caller cannot tell a known address from an unknown one', async () => {
      const known = email();
      await signIn(known);

      const forKnown = await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: known });
      const forUnknown = await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: email() });

      expect(forKnown.status).toBe(204);
      expect(forUnknown.status).toBe(204);
      expect(forKnown.body).toEqual(forUnknown.body);
    });

    it('never stores the code in plaintext', async () => {
      const address = email();
      const code = await requestCode(address);

      const row = await prisma.authCode.findFirstOrThrow({
        where: { email: address },
        orderBy: { createdAt: 'desc' },
      });

      expect(row.codeHash).not.toContain(code);
      expect(row.codeHash.startsWith('scrypt$')).toBe(true);
    });

    it('issues a six-digit code', async () => {
      expect(await requestCode(email())).toMatch(/^\d{6}$/);
    });

    it('retires the previous code when a new one is requested', async () => {
      const address = email();
      const first = await requestCode(address);
      await requestCode(address);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code: first })
        .expect(401);
    });

    it('rejects a malformed address before doing any work', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: 'not-an-email' })
        .expect(422);
    });

    it('rejects an unexpected property rather than ignoring it', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: email(), role: 'admin', customerId: 'cust_someone' });

      expect(response.status).toBe(422);
      expect(response.body.kind).toBe('VALIDATION');
    });

    it('rate limits repeated requests for one address', async () => {
      const address = email();
      // The rule allows 3 per 15 minutes.
      await requestCode(address);
      await requestCode(address);
      await requestCode(address);

      const blocked = await request(app.getHttpServer())
        .post('/api/v1/auth/request-code')
        .send({ email: address });

      expect(blocked.status).toBe(429);
      expect(blocked.body.kind).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('code verification', () => {
    it('signs in and returns the customer', async () => {
      const address = email();
      const code = await requestCode(address);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.customer.email).toBe(address);
      expect(response.body.customer.emailVerified).toBe(true);
    });

    it('creates the account on first successful sign-in', async () => {
      const address = email();
      expect(await prisma.customer.findUnique({ where: { email: address } })).toBeNull();
      await signIn(address);
      expect(await prisma.customer.findUnique({ where: { email: address } })).not.toBeNull();
    });

    it('refuses a wrong code', async () => {
      const address = email();
      const code = await requestCode(address);
      const wrong = code === '000000' ? '111111' : '000000';

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code: wrong })
        .expect(401);
    });

    it('gives the same answer for a wrong code and for no pending code', async () => {
      const withPending = email();
      await requestCode(withPending);

      const wrongCode = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: withPending, code: '000000' });
      const noPending = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: email(), code: '000000' });

      expect(wrongCode.status).toBe(noPending.status);
      expect(wrongCode.body.code).toBe(noPending.body.code);
      expect(wrongCode.body.userMessage).toEqual(noPending.body.userMessage);
    });

    it('destroys the code after the attempt limit, rather than allowing endless guesses', async () => {
      const address = email();
      const code = await requestCode(address);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/verify-code')
          .send({ email: address, code: '000000' });
      }

      // Even the correct code no longer works.
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(401);
    });

    it('is single use', async () => {
      const address = email();
      const code = await requestCode(address);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(401);
    });

    it('rejects a code that is not six digits', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: email(), code: '12' })
        .expect(422);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: email(), code: 'abcdef' })
        .expect(422);
    });

    it('treats the address case-insensitively, so one person cannot get two accounts', async () => {
      const address = `Case-${Math.random().toString(36).slice(2, 8)}@Example.COM`;
      const code = await requestCode(address);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address.toLowerCase(), code })
        .expect(200);

      expect(await prisma.customer.count({ where: { email: address.toLowerCase() } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('session cookie', () => {
    it('is httpOnly, so a cross-site script cannot read it', async () => {
      const address = email();
      const code = await requestCode(address);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(200);

      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//);
    });

    it('never puts the session token in the response body', async () => {
      const address = email();
      const code = await requestCode(address);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: address, code })
        .expect(200);

      const cookieValue = response.headers['set-cookie'][0].split('=')[1].split(';')[0];
      expect(JSON.stringify(response.body)).not.toContain(cookieValue);
      // The session id is server-side only; the client sees an opaque token.
      expect(JSON.stringify(response.body)).not.toMatch(/sess_/);
    });

    it('stores only a hash of the token, so a leaked table yields no live sessions', async () => {
      const address = email();
      const cookie = await signIn(address);
      const token = cookie.split('=')[1];

      const stored = await prisma.customerSession.findUnique({
        where: { tokenHash: hashSessionToken(token) },
      });

      expect(stored).not.toBeNull();
      // The plaintext appears nowhere in the row.
      expect(JSON.stringify(stored)).not.toContain(token);
    });

    it('identifies the customer on a later request', async () => {
      const address = email();
      const cookie = await signIn(address);

      const me = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(me.body.authenticated).toBe(true);
      expect(me.body.customer.email).toBe(address);
    });

    it('reports anonymous without a cookie, rather than 401', async () => {
      const me = await request(app.getHttpServer()).get('/api/v1/me').expect(200);
      expect(me.body.authenticated).toBe(false);
      expect(me.body.customer).toBeUndefined();
    });

    it('ignores a forged cookie value', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', 'tt_session=totally-made-up-value')
        .expect(200);
      expect(me.body.authenticated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('session fixation and revocation', () => {
    it('rotates the token on sign-in, so a planted cookie cannot survive it', async () => {
      const address = email();

      // An attacker plants a session by getting one issued first.
      const planted = await signIn(email());

      const code = await requestCode(address);
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .set('Cookie', planted)
        .send({ email: address, code })
        .expect(200);

      const issued = response.headers['set-cookie'][0].split(';')[0];
      expect(issued).not.toBe(planted);

      // The planted token is now revoked, not merely superseded.
      const stale = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', planted)
        .expect(200);
      expect(stale.body.authenticated).toBe(false);
    });

    it('revokes server-side on logout, so the cookie alone is worthless', async () => {
      const cookie = await signIn(email());

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      // Replaying the same cookie value must not work.
      const replay = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(replay.body.authenticated).toBe(false);
    });

    it('clears the cookie on logout as well as revoking it', async () => {
      const cookie = await signIn(email());
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect(response.headers['set-cookie'][0]).toMatch(/tt_session=;/);
    });

    it('logging out without a session is harmless', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(204);
    });

    it('refuses an expired session', async () => {
      const address = email();
      const cookie = await signIn(address);
      const token = cookie.split('=')[1];

      await prisma.customerSession.update({
        where: { tokenHash: hashSessionToken(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const me = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', cookie)
        .expect(200);
      expect(me.body.authenticated).toBe(false);
    });

    it('survives a restart, because the session lives in PostgreSQL', async () => {
      const address = email();
      const cookie = await signIn(address);

      // A second application instance stands in for a redeployed process.
      const restarted = await createApp();
      await restarted.init();
      try {
        const me = await request(restarted.getHttpServer())
          .get('/api/v1/me')
          .set('Cookie', cookie)
          .expect(200);
        expect(me.body.authenticated).toBe(true);
        expect(me.body.customer.email).toBe(address);
      } finally {
        await restarted.close();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('profile', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .send({ displayName: 'Nobody' })
        .expect(401);
    });

    it('updates the caller\'s own profile', async () => {
      const cookie = await signIn(email());
      const response = await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .send({ displayName: 'ישראל ישראלי', preferredLocale: 'he' })
        .expect(200);

      expect(response.body.displayName).toBe('ישראל ישראלי');
    });

    it('refuses to let a caller change fields that are not theirs to change', async () => {
      const cookie = await signIn(email());
      const response = await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .send({ email: 'someone-else@example.com', id: 'cust_other', emailVerified: true });

      expect(response.status).toBe(422);
      expect(response.body.kind).toBe('VALIDATION');
    });

    it('rejects an invalid locale', async () => {
      const cookie = await signIn(email());
      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Cookie', cookie)
        .send({ preferredLocale: 'fr' })
        .expect(422);
    });
  });

  // -------------------------------------------------------------------------
  describe('error and logging hygiene', () => {
    it('never returns a stack trace or a database error', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: email(), code: '000000' })
        .expect(401);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toMatch(/\bat \w+.*:\d+:\d+/);
      expect(serialised).not.toMatch(/prisma|postgres|sql/i);
      expect(response.body.userMessage.he).toBeDefined();
    });

    it('never echoes the submitted code back to the caller', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-code')
        .send({ email: email(), code: '424242' })
        .expect(401);

      expect(JSON.stringify(response.body)).not.toContain('424242');
    });
  });
});
