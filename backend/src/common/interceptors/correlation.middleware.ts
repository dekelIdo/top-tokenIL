import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Request augmented with the id used to correlate logs and error bodies. */
export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

/**
 * Adopts the client's `X-Request-Id` when it sends one, otherwise mints one.
 *
 * The Angular client already sends this header on every request, so a customer
 * reporting "my order failed at 14:03" resolves to a single log query. The value
 * is echoed back on the response and into the error body.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: CorrelatedRequest, res: Response, next: NextFunction): void {
    const incoming = req.header('X-Request-Id');
    // Never trust a client string verbatim into logs: cap it and strip anything
    // that is not id-shaped, so a header cannot forge log lines.
    const correlationId =
      incoming && /^[A-Za-z0-9_-]{1,64}$/.test(incoming) ? incoming : randomUUID();

    req.correlationId = correlationId;
    res.setHeader('X-Request-Id', correlationId);
    next();
  }
}
