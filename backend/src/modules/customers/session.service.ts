import { Inject, Injectable } from '@nestjs/common';
import type { CustomerSession } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';

import { AppLogger } from '../../common/logging/app-logger.service';
import {
  generateId,
  generateSessionToken,
  hashSessionToken,
} from '../../common/crypto/tokens';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';

/** The cookie the browser holds. Its value never reaches JavaScript. */
export const SESSION_COOKIE = 'tt_session';

/** Absolute lifetime. Idle expiry is handled by `lastSeenAt` housekeeping. */
const SESSION_TTL_DAYS = 30;

/**
 * Server-side sessions, for anonymous visitors as well as signed-in customers.
 *
 * An anonymous session is the mechanism that lets someone buy without creating
 * an account and still be the only person who can read that order afterwards.
 * The cookie is the capability; the database row is the authority.
 *
 * Three properties this file exists to guarantee:
 *
 * 1. The token is never stored. Only its SHA-256 hash is, so a database leak
 *    does not hand over live sessions.
 * 2. The browser never sees the session id, only the opaque token. Angular
 *    cannot read either, because the cookie is httpOnly.
 * 3. Signing in rotates the session. Reusing the pre-authentication token would
 *    leave a fixation window open.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Resolves the session a request carries, or null.
   *
   * Never creates one: browsing the catalog should not write a row for every
   * crawler that passes through.
   */
  async resolve(request: Request): Promise<CustomerSession | null> {
    const token = this.readToken(request);
    if (!token) {
      return null;
    }

    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      return null;
    }

    return session;
  }

  /**
   * Returns the request's session, creating an anonymous one if there is none.
   *
   * Called by the flows that need something to own state: adding to a cart,
   * opening a checkout, placing an order.
   */
  async ensure(request: Request, response: Response): Promise<CustomerSession> {
    const existing = await this.resolve(request);
    if (existing) {
      await this.touch(existing.id);
      return existing;
    }
    return this.issue(response, { customerId: null, request });
  }

  /**
   * Issues a session and sets the cookie.
   *
   * `customerId` is null for an anonymous visitor, which is the normal case
   * before someone signs in.
   */
  async issue(
    response: Response,
    options: { customerId: string | null; request: Request },
  ): Promise<CustomerSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const session = await this.prisma.customerSession.create({
      data: {
        id: generateId('sess'),
        customerId: options.customerId,
        tokenHash: hashSessionToken(token),
        userAgent: options.request.header('user-agent')?.slice(0, 255) ?? null,
        ip: this.clientIp(options.request),
        expiresAt,
      },
    });

    response.cookie(SESSION_COOKIE, token, this.cookieOptions(expiresAt));

    // The token and the session id are both omitted deliberately: a log line is
    // not a place where a session can be picked up.
    this.logger.info('session issued', { authenticated: options.customerId !== null });

    return session;
  }

  /**
   * Attaches a session to a customer after successful authentication, rotating
   * the token in the process.
   *
   * Rotation is what closes the session-fixation hole: an attacker who planted a
   * cookie value before sign-in holds a token that is revoked the moment the
   * real customer authenticates.
   */
  async attachToCustomer(
    request: Request,
    response: Response,
    customerId: string,
  ): Promise<CustomerSession> {
    const previous = await this.resolve(request);
    if (previous) {
      await this.revoke(previous.id);
    }
    return this.issue(response, { customerId, request });
  }

  /** Revokes server-side and clears the cookie. Either alone would be a bug. */
  async signOut(request: Request, response: Response): Promise<void> {
    const session = await this.resolve(request);
    if (session) {
      await this.revoke(session.id);
    }
    // Cleared regardless, so a stale or already-revoked cookie does not linger.
    response.clearCookie(SESSION_COOKIE, this.cookieOptions(new Date(0)));
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every session a customer holds. Used when signing out everywhere. */
  async revokeAllForCustomer(customerId: string): Promise<number> {
    const result = await this.prisma.customerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async touch(sessionId: string): Promise<void> {
    await this.prisma.customerSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    });
  }

  private readToken(request: Request): string | undefined {
    const value = request.cookies?.[SESSION_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private cookieOptions(expires: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      domain: this.config.cookieDomain,
      path: '/',
      expires,
    };
  }

  /**
   * Best-effort client address for the session record and rate limiting.
   *
   * `x-forwarded-for` is only trustworthy behind a proxy that sets it, which is
   * why Express `trust proxy` is configured for deployed environments and this
   * falls back to the socket address otherwise.
   */
  private clientIp(request: Request): string | null {
    return request.ip ?? request.socket?.remoteAddress ?? null;
  }
}
