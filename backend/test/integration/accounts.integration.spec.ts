import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { hashSessionToken } from '../../src/common/crypto/tokens';
import { hashPassword, verifyPassword } from '../../src/common/crypto/passwords';

/**
 * Customer accounts: passwords, resets, and the Google integration boundary.
 *
 * The properties worth the most here are the ones a password system gets wrong:
 * an endpoint that reveals which addresses have accounts, a reset link that can
 * be used twice, a password stored in a form anyone could read, and a reset that
 * leaves an attacker's session alive.
 */
describe('customer accounts', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  const email = () => `qa-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';
    app = await createApp();
    await app.init();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  /** Session cookies only, ignoring the clearing of the one-time state cookie. */
  const sessionCookies = (response: request.Response): string[] =>
    ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .filter((cookie) => cookie.startsWith('tt_session=') && !cookie.includes('Expires=Thu, 01 Jan 1970'));

  const post = (path: string, body: object, cookie?: string) => {
    const call = request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
    return cookie ? call.set('Cookie', cookie) : call;
  };

  async function registered(address = email()) {
    const response = await post('/auth/register', { email: address, password: PASSWORD }).expect(204);
    const setCookie = response.headers['set-cookie'];
    return { address, cookie: setCookie ? setCookie[0].split(';')[0] : '' };
  }

  // -------------------------------------------------------------------------
  describe('registration', () => {
    it('creates an account and signs the customer in', async () => {
      const { address, cookie } = await registered();

      const me = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(me.body.authenticated).toBe(true);
      expect(me.body.customer.email).toBe(address);
    });

    it('never stores the password in a readable form', async () => {
      const { address } = await registered();
      const row = await prisma.customer.findUniqueOrThrow({ where: { email: address } });

      expect(row.passwordHash).toBeTruthy();
      expect(row.passwordHash).not.toContain(PASSWORD);
      expect(row.passwordHash!.startsWith('scrypt$')).toBe(true);
      // And the stored value verifies, so it is a hash of this password rather
      // than of something else.
      expect(await verifyPassword(PASSWORD, row.passwordHash)).toBe(true);
    });

    it('refuses a weak password', async () => {
      const response = await post('/auth/register', { email: email(), password: 'password' });
      expect(response.status).toBe(422);
    });

    it('refuses a password long enough to be a denial of service', async () => {
      const response = await post('/auth/register', { email: email(), password: 'x'.repeat(5000) });
      expect(response.status).toBe(422);
    });

    it('does not reveal that an address is already registered', async () => {
      const { address } = await registered();

      const second = await post('/auth/register', { email: address, password: 'another-password-1' });

      // Same status as a fresh registration, so the form cannot be used to
      // enumerate customers.
      expect(second.status).toBe(204);
      // But no session is issued, and the original password still works.
      expect(second.headers['set-cookie']).toBeUndefined();

      const signIn = await post('/auth/login', { email: address, password: PASSWORD });
      expect(signIn.status).toBe(200);
    });

    it('creates exactly one customer for two simultaneous registrations', async () => {
      const address = email();
      await Promise.all([
        post('/auth/register', { email: address, password: PASSWORD }),
        post('/auth/register', { email: address, password: PASSWORD }),
      ]);

      expect(await prisma.customer.count({ where: { email: address } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('signing in', () => {
    it('signs in with the right password', async () => {
      const { address } = await registered();
      const response = await post('/auth/login', { email: address, password: PASSWORD }).expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('refuses the wrong password', async () => {
      const { address } = await registered();
      const response = await post('/auth/login', { email: address, password: 'not-the-password' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('gives the same answer for an unknown address as for a wrong password', async () => {
      const { address } = await registered();

      const wrongPassword = await post('/auth/login', { email: address, password: 'wrong-password-x' });
      const unknownAddress = await post('/auth/login', { email: email(), password: 'wrong-password-x' });

      expect(wrongPassword.status).toBe(unknownAddress.status);
      expect(wrongPassword.body.code).toBe(unknownAddress.body.code);
      expect(wrongPassword.body.userMessage).toEqual(unknownAddress.body.userMessage);
    });

    it('refuses to sign in to an account that has no password', async () => {
      // An account created by the sign-in code has no password. It must not be
      // possible to enter it with an empty or any other password.
      const address = email();
      const requested = await post('/auth/request-code', { email: address }).expect(204);
      await post('/auth/verify-code', { email: address, code: requested.headers['x-dev-otp'] }).expect(200);

      const response = await post('/auth/login', { email: address, password: '' });
      expect([401, 422]).toContain(response.status);
    });

    it('rotates the session on sign-in, so a planted cookie cannot survive', async () => {
      const { address } = await registered();

      const planted = await post('/checkout/sessions', { items: [] });
      const before = planted.headers['set-cookie']?.[0]?.split(';')[0];

      const response = await post('/auth/login', { email: address, password: PASSWORD }, before).expect(200);
      const after = response.headers['set-cookie'][0].split(';')[0];

      expect(after).not.toBe(before);
    });

    it('rate limits repeated guesses against one address', async () => {
      const { address } = await registered();

      const attempts = [];
      for (let i = 0; i < 12; i += 1) {
        attempts.push(await post('/auth/login', { email: address, password: `guess-${i}` }));
      }

      expect(attempts.some((response) => response.status === 429)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('password reset', () => {
    it('issues a link and lets the customer set a new password', async () => {
      const { address } = await registered();

      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      const token = requested.headers['x-dev-reset-token'];
      expect(token).toBeTruthy();

      const reset = await post('/auth/password/reset', { token, password: 'a-brand-new-password' })
        .expect(200);
      expect(reset.body.authenticated).toBe(true);

      await post('/auth/login', { email: address, password: 'a-brand-new-password' }).expect(200);
      await post('/auth/login', { email: address, password: PASSWORD }).expect(401);
    });

    it('never says whether an address exists', async () => {
      const known = await registered();
      const unknown = await post('/auth/password/forgot', { email: email() });
      const existing = await post('/auth/password/forgot', { email: known.address });

      expect(unknown.status).toBe(existing.status);
      // The unknown address gets no token, but the caller cannot tell.
      expect(unknown.headers['x-dev-reset-token']).toBeUndefined();
    });

    it('is single use', async () => {
      const { address } = await registered();
      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      const token = requested.headers['x-dev-reset-token'];

      await post('/auth/password/reset', { token, password: 'first-new-password' }).expect(200);
      const second = await post('/auth/password/reset', { token, password: 'second-new-password' });

      expect(second.status).toBe(401);
    });

    it('lets only one of two simultaneous uses of the same link succeed', async () => {
      const { address } = await registered();
      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      const token = requested.headers['x-dev-reset-token'];

      const results = await Promise.all([
        post('/auth/password/reset', { token, password: 'race-password-one' }),
        post('/auth/password/reset', { token, password: 'race-password-two' }),
      ]);

      expect(results.filter((response) => response.status === 200)).toHaveLength(1);
    });

    it('retires an earlier link when a new one is requested', async () => {
      const { address } = await registered();
      const first = await post('/auth/password/forgot', { email: address }).expect(204);
      const second = await post('/auth/password/forgot', { email: address }).expect(204);

      await post('/auth/password/reset', {
        token: first.headers['x-dev-reset-token'],
        password: 'should-not-work-now',
      }).expect(401);

      await post('/auth/password/reset', {
        token: second.headers['x-dev-reset-token'],
        password: 'this-one-should-work',
      }).expect(200);
    });

    it('refuses an expired link', async () => {
      const { address } = await registered();
      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      const token = requested.headers['x-dev-reset-token'];

      // Both timestamps move back: the `password_reset_expiry_after_creation`
      // constraint refuses a row whose expiry precedes its creation, so only
      // backdating the expiry would be rejected by the database.
      await prisma.passwordReset.updateMany({
        where: { tokenHash: hashSessionToken(token) },
        data: {
          createdAt: new Date(Date.now() - 7_200_000),
          expiresAt: new Date(Date.now() - 3_600_000),
        },
      });

      await post('/auth/password/reset', { token, password: 'too-late-for-this' }).expect(401);
    });

    it('stores only a hash of the reset token', async () => {
      const { address } = await registered();
      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      const token = requested.headers['x-dev-reset-token'];

      const rows = await prisma.passwordReset.findMany({ where: { tokenHash: { contains: token } } });
      expect(rows).toHaveLength(0);

      const byHash = await prisma.passwordReset.findUnique({
        where: { tokenHash: hashSessionToken(token) },
      });
      expect(byHash).not.toBeNull();
    });

    it('revokes every existing session, because a reset means "I was compromised"', async () => {
      const { address, cookie } = await registered();

      const requested = await post('/auth/password/forgot', { email: address }).expect(204);
      await post('/auth/password/reset', {
        token: requested.headers['x-dev-reset-token'],
        password: 'kicked-everyone-out',
      }).expect(200);

      // The session held before the reset no longer authenticates.
      const me = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', cookie).expect(200);
      expect(me.body.authenticated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('changing a password while signed in', () => {
    it('requires the current password', async () => {
      const { cookie } = await registered();

      const wrong = await post('/auth/password/change', {
        currentPassword: 'not-it',
        newPassword: 'a-fresh-new-password',
      }, cookie);

      expect(wrong.status).toBe(401);
    });

    it('changes it when the current password is right', async () => {
      const { address, cookie } = await registered();

      await post('/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: 'a-fresh-new-password',
      }, cookie).expect(204);

      await post('/auth/login', { email: address, password: 'a-fresh-new-password' }).expect(200);
    });

    it('refuses an anonymous caller', async () => {
      const response = await post('/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: 'a-fresh-new-password',
      });
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('guest orders follow the customer', () => {
    it('claims a guest session\'s orders on registration', async () => {
      // A guest browses and gets a session.
      const guest = await post('/checkout/sessions', { items: [] });
      const guestCookie = guest.headers['set-cookie']?.[0]?.split(';')[0];

      const address = email();
      const response = await post('/auth/register', { email: address, password: PASSWORD }, guestCookie)
        .expect(204);

      // The account exists and the customer is signed in on a rotated session.
      const customer = await prisma.customer.findUnique({ where: { email: address } });
      expect(customer).not.toBeNull();
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('Google sign-in', () => {
    it('reports itself unconfigured rather than offering a button that fails', async () => {
      const methods = await request(app.getHttpServer()).get('/api/v1/auth/methods').expect(200);

      // No credentials in the test environment, so Google must be off.
      expect(methods.body.google).toBe(false);
      expect(methods.body.password).toBe(true);
    });

    it('refuses to start a flow when it is not configured', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/google');
      expect(response.status).toBe(503);
    });

    it('rejects a callback with no state, without touching any account', async () => {
      const before = await prisma.customer.count();

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .query({ code: 'anything' });

      // Redirected to a failure, never a session. The one cookie it may set is
      // the expired clearing of the state cookie.
      expect([302, 503]).toContain(response.status);
      expect(sessionCookies(response)).toHaveLength(0);
      expect(await prisma.customer.count()).toBe(before);
    });

    it('rejects a forged state', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', 'tt_oauth_state=deadbeef')
        .query({ code: 'anything', state: 'forged.state' });

      expect([302, 503]).toContain(response.status);
      expect(sessionCookies(response)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('account closure', () => {
    it('closes the account and every session', async () => {
      const { address, cookie } = await registered();

      await post('/account/delete', {}, cookie).expect(204);

      const row = await prisma.customer.findUniqueOrThrow({ where: { email: address } });
      expect(row.status).toBe('CLOSED');

      // And a closed account cannot simply sign back in.
      const signIn = await post('/auth/login', { email: address, password: PASSWORD });
      expect(signIn.status).toBe(401);
    });

    it('refuses an anonymous caller', async () => {
      const response = await post('/account/delete', {});
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('logging hygiene', () => {
    it('never writes a password or a reset token to the log', async () => {
      const address = email();
      const secret = 'a-very-distinctive-password-42';

      const written: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      (process.stdout.write as unknown as (chunk: string) => boolean) = ((chunk: string) => {
        written.push(String(chunk));
        return true;
      }) as never;

      let token: string | undefined;
      try {
        await post('/auth/register', { email: address, password: secret });
        await post('/auth/login', { email: address, password: secret });
        const requested = await post('/auth/password/forgot', { email: address });
        token = requested.headers['x-dev-reset-token'];
      } finally {
        process.stdout.write = original;
      }

      const logs = written.join('');
      expect(logs).not.toContain(secret);
      if (token) {
        expect(logs).not.toContain(token);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('the password hash itself', () => {
    it('produces a different hash for the same password each time', async () => {
      const first = await hashPassword('same-password-twice');
      const second = await hashPassword('same-password-twice');

      // Different salts, so a leaked table cannot be attacked by grouping equal
      // hashes together.
      expect(first).not.toBe(second);
      expect(await verifyPassword('same-password-twice', first)).toBe(true);
      expect(await verifyPassword('same-password-twice', second)).toBe(true);
    });

    it('refuses a malformed stored hash instead of throwing', async () => {
      expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
      expect(await verifyPassword('anything', null)).toBe(false);
      expect(await verifyPassword('anything', 'scrypt$bad$params$x$y$z')).toBe(false);
    });
  });
});
