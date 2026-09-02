import { Controller, Get, Headers, HttpCode, Inject } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/environment';
import { notFoundError, unauthorizedError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { HousekeepingService } from './housekeeping.service';

/**
 * Drives the housekeeping sweep from an external scheduler.
 *
 * An always-on host runs the sweep on a timer inside the process and never
 * needs this. A serverless host cannot hold a timer, because the process does
 * not stay alive between requests, so the sweep is triggered by a scheduler
 * (Vercel Cron) hitting this endpoint on a fixed schedule.
 *
 * The two paths do the exact same work: both call `HousekeepingService.sweep`.
 * There is no second implementation to drift.
 */
@Controller('internal/housekeeping')
export class HousekeepingController {
  constructor(
    private readonly housekeeping: HousekeepingService,
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Runs one sweep.
   *
   * Guarded by a shared secret rather than an operator token: the caller is a
   * scheduler, not a person, and it authenticates with the `Authorization`
   * header Vercel Cron attaches from `CRON_SECRET`.
   *
   * When no secret is configured the route reports not-found rather than
   * running unauthenticated. A sweep is safe to run, but an open endpoint that
   * touches every customer's stock and payments is a needless handle for abuse.
   *
   * A GET, because Vercel Cron issues a GET. The sweep mutates, which normally
   * argues for POST, but the caller is a scheduler on a fixed platform contract
   * and the secret gate is what actually protects it.
   */
  @Get()
  @HttpCode(200)
  async sweep(@Headers('authorization') authorization?: string) {
    const secret = this.config.cronSecret;

    if (!secret) {
      // Indistinguishable from a route that does not exist, on purpose: an
      // undeployed feature should not advertise itself.
      throw notFoundError('not found');
    }

    if (!matchesBearer(authorization, secret)) {
      this.logger.warn('housekeeping sweep rejected: bad or missing cron secret');
      throw unauthorizedError('invalid cron secret');
    }

    const result = await this.housekeeping.sweep();
    return { ok: true, ...result };
  }
}

/** Timing-safe comparison of a `Bearer <secret>` header against the secret. */
function matchesBearer(header: string | undefined, secret: string): boolean {
  if (!header) {
    return false;
  }

  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer' || rest.length === 0) {
    return false;
  }

  const presented = Buffer.from(rest.join(' ').trim(), 'utf8');
  const expected = Buffer.from(secret, 'utf8');

  if (presented.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(presented, expected);
}
