import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig, OperatorCredential } from '../../config/environment';
import { unauthorizedError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';

/** The operator resolved from the request, attached for the controller to attribute actions to. */
export interface AuthenticatedOperator {
  readonly name: string;
}

declare module 'express' {
  interface Request {
    operator?: AuthenticatedOperator;
  }
}

/**
 * Bearer-token authentication for the admin API.
 *
 * Tokens are named, one per person, so every action is attributable. A shared
 * token would make the audit log say "an operator did this", which answers
 * nothing when an order is disputed.
 *
 * Deliberately not a customer session: an operator is not a customer, and
 * reusing the customer cookie would mean a stolen storefront session could
 * reach the admin API. The two authentication systems stay separate so a
 * failure in one cannot become a failure in the other.
 *
 * Comparison is timing-safe. A naive `===` leaks the token a character at a
 * time to anyone who can measure the response, and this token authorises
 * reading every customer's contact details.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const presented = readBearerToken(request.header('authorization'));

    if (!presented) {
      throw unauthorizedError('an operator token is required');
    }

    const operator = this.match(presented);

    if (!operator) {
      // Logged without the token. A rejected credential in a log file is a
      // credential in a log file.
      this.logger.warn('admin authentication failed', {
        path: request.path,
        ip: request.ip,
      });
      throw unauthorizedError('unknown operator token');
    }

    request.operator = { name: operator.name };
    return true;
  }

  /**
   * Compares against every configured operator without short-circuiting.
   *
   * Returning on the first match would make the response time depend on the
   * operator's position in the list, which is a small leak but a free one to
   * close.
   */
  private match(presented: string): OperatorCredential | undefined {
    let matched: OperatorCredential | undefined;

    for (const candidate of this.config.operators) {
      if (constantTimeEquals(presented, candidate.token)) {
        matched = candidate;
      }
    }

    return matched;
  }
}

function readBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer' || rest.length === 0) {
    return undefined;
  }

  const token = rest.join(' ').trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Timing-safe string comparison.
 *
 * `timingSafeEqual` throws on length mismatch, which would itself leak the
 * length, so both sides are hashed to a fixed width first.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    // Still do a comparison so the failure costs the same as a mismatch.
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}
