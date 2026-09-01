import { Injectable } from '@nestjs/common';

import { rateLimitedError } from '../errors/api-error';
import { PrismaService } from '../../database/prisma.service';

export interface RateLimitRule {
  /** What is being limited, e.g. `auth:request-code:email`. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Fixed-window rate limiting, stored in PostgreSQL.
 *
 * In the database rather than in memory for two reasons. A restart must not
 * hand an attacker a fresh budget, and when the service runs as more than one
 * instance on Render they have to share a counter rather than each granting the
 * full allowance.
 *
 * Fixed windows allow a burst across a boundary, which is acceptable here: the
 * limits exist to stop brute force and enumeration, not to smooth traffic. A
 * sliding window would cost more storage for a property nothing needs.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a hit and throws once the rule is exceeded.
   *
   * The upsert is atomic, so concurrent requests cannot both read "one below the
   * limit" and both proceed.
   */
  async consume(rule: RateLimitRule, key: string): Promise<void> {
    const bucket = `${rule.name}:${key}`;
    const now = new Date();
    const windowEnds = new Date(now.getTime() + rule.windowSeconds * 1000);

    const [row] = await this.prisma.$queryRaw<{ count: number; window_ends: Date }[]>`
      INSERT INTO rate_limit_counters (bucket, count, window_ends)
      VALUES (${bucket}, 1, ${windowEnds})
      ON CONFLICT (bucket) DO UPDATE SET
        count = CASE
          WHEN rate_limit_counters.window_ends <= ${now} THEN 1
          ELSE rate_limit_counters.count + 1
        END,
        window_ends = CASE
          WHEN rate_limit_counters.window_ends <= ${now} THEN ${windowEnds}
          ELSE rate_limit_counters.window_ends
        END
      RETURNING count, window_ends
    `;

    if (row && row.count > rule.limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(row.window_ends).getTime() - now.getTime()) / 1000),
      );
      throw rateLimitedError(`Rate limit ${rule.name} exceeded for ${key}`, retryAfter);
    }
  }

  /** Current count, for tests and diagnostics. Does not consume. */
  async peek(rule: RateLimitRule, key: string): Promise<number> {
    const row = await this.prisma.rateLimitCounter.findUnique({
      where: { bucket: `${rule.name}:${key}` },
    });
    if (!row || row.windowEnds <= new Date()) {
      return 0;
    }
    return row.count;
  }

  /** Removes expired buckets. Called by housekeeping, safe to run any time. */
  async prune(): Promise<number> {
    const result = await this.prisma.rateLimitCounter.deleteMany({
      where: { windowEnds: { lte: new Date() } },
    });
    return result.count;
  }
}

/**
 * The limits themselves, in one place so they can be reviewed together rather
 * than discovered one controller at a time. Values follow
 * docs/API-CONTRACT.md §6.
 */
export const RATE_LIMITS = {
  /** Stops someone using sign-in as a way to send mail to a stranger. */
  otpRequestPerEmail: { name: 'auth:request-code:email', limit: 3, windowSeconds: 15 * 60 },
  /**
   * Per-IP is looser than per-email on purpose. Mobile carriers put thousands of
   * customers behind one address, so a tight per-IP limit locks out real people
   * while a determined attacker rotates addresses anyway. The per-email rule is
   * what actually stops targeted abuse; this one stops bulk enumeration.
   */
  otpRequestPerIp: { name: 'auth:request-code:ip', limit: 30, windowSeconds: 60 * 60 },
  /** Six digits is a million options; without this it is a weekend of guessing. */
  otpVerifyPerIp: { name: 'auth:verify-code:ip', limit: 10, windowSeconds: 60 * 60 },

  /**
   * Password sign-in. Per-email is the tight one because it is what stops a
   * targeted guessing run against a known customer; per-IP stays looser for the
   * same carrier-NAT reason as the sign-in codes.
   */
  loginPerEmail: { name: 'auth:login:email', limit: 8, windowSeconds: 15 * 60 },
  loginPerIp: { name: 'auth:login:ip', limit: 40, windowSeconds: 60 * 60 },

  /** Registration is expensive to process and trivial to script. */
  registerPerIp: { name: 'auth:register:ip', limit: 10, windowSeconds: 60 * 60 },

  /** A reset sends mail to somebody, so per-address is the abuse that matters. */
  passwordResetPerEmail: { name: 'auth:reset:email', limit: 3, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'auth:reset:ip', limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;
