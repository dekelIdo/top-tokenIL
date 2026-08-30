import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { conflictError, validationError } from '../errors/api-error';
import { AppLogger } from '../logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';

/** Keys are kept long enough to cover any realistic client retry, then purged. */
const RETENTION_HOURS = 24;

/**
 * How long a claim may stay IN_PROGRESS before another request may take it over.
 *
 * A process killed mid-order leaves a claim nobody will ever finish. Without a
 * takeover window the customer could never retry that order, because every
 * attempt would answer "already in progress". Sixty seconds is far longer than
 * the work takes and short enough that a customer retry succeeds.
 */
const STALE_CLAIM_SECONDS = 60;

export type ClaimOutcome =
  | { kind: 'claimed' }
  | { kind: 'replay'; status: number; body: unknown };

/**
 * Idempotency, stored in PostgreSQL.
 *
 * The table is the authority, not a map in this process: a retry that lands on
 * another instance, or on the same instance after a restart, has to reach the
 * same decision.
 *
 * The protocol is a claim followed by a completion. A request first tries to
 * insert its key; the insert either succeeds, which grants the right to do the
 * work, or conflicts, which means someone else already has. Nothing branches on
 * a prior read, so two simultaneous requests cannot both believe they are first.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * A stable fingerprint of what was asked for.
   *
   * Reusing a key for a different request is a client bug, and returning the
   * first result would hide it. Hashing the request is how the two are told
   * apart.
   */
  fingerprint(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
  }

  /**
   * Claims the key, or reports what to do instead.
   *
   * - `claimed`: this caller does the work and must call `complete` or `release`.
   * - `replay`: the work is already done; return the stored response verbatim.
   *
   * Throws for the two cases that must not proceed: the same key with a
   * different request, and a request that is genuinely still in flight.
   */
  async claim(key: string, endpoint: string, requestHash: string): Promise<ClaimOutcome> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_HOURS * 60 * 60 * 1000);

    // One statement decides who owns the work. `ON CONFLICT DO NOTHING` means a
    // loser gets no row back rather than an exception to interpret.
    const inserted = await this.prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO idempotency_keys (key, endpoint, request_hash, status, created_at, expires_at)
      VALUES (${key}, ${endpoint}, ${requestHash}, 'IN_PROGRESS', ${now}, ${expiresAt})
      ON CONFLICT (key, endpoint) DO NOTHING
      RETURNING key
    `;

    if (inserted.length > 0) {
      return { kind: 'claimed' };
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_endpoint: { key, endpoint } },
    });

    if (!existing) {
      // The row was purged between the insert and this read. Treat it as a fresh
      // attempt rather than failing on a race that harms nobody.
      return this.claim(key, endpoint, requestHash);
    }

    if (existing.requestHash !== requestHash) {
      this.logger.warn('idempotency key reused with a different request', { endpoint });
      throw validationError(
        'This idempotency key was already used for a different request',
        [],
        'IDEMPOTENCY_KEY_REUSED',
      );
    }

    if (existing.status === 'COMPLETED') {
      return {
        kind: 'replay',
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
      };
    }

    // Still IN_PROGRESS. If the claim is old enough that no live request could
    // still be working on it, take it over; the previous attempt died.
    const age = (now.getTime() - existing.createdAt.getTime()) / 1000;
    if (age > STALE_CLAIM_SECONDS) {
      const takenOver = await this.prisma.idempotencyKey.updateMany({
        where: {
          key,
          endpoint,
          status: 'IN_PROGRESS',
          createdAt: existing.createdAt,
        },
        data: { createdAt: now, requestHash },
      });

      if (takenOver.count === 1) {
        this.logger.warn('took over an abandoned idempotency claim', { endpoint, ageSeconds: Math.round(age) });
        return { kind: 'claimed' };
      }
    }

    throw conflictError(
      'A request with this idempotency key is still in progress',
      'IDEMPOTENT_REQUEST_IN_PROGRESS',
    );
  }

  /**
   * Records the response so a later retry replays it instead of re-executing.
   *
   * Runs inside the caller's transaction when one is supplied, so the stored
   * response and the work it describes commit together. Storing it separately
   * would allow a completed order with no record of the reply, or a recorded
   * reply for an order that rolled back.
   */
  async complete(
    key: string,
    endpoint: string,
    status: number,
    body: unknown,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.idempotencyKey.updateMany({
      where: { key, endpoint },
      data: {
        status: 'COMPLETED',
        responseStatus: status,
        responseBody: body as never,
      },
    });
  }

  /**
   * Gives up a claim after a failure, so the customer can try again.
   *
   * Leaving it IN_PROGRESS would block the retry for a minute for no reason:
   * nothing was created, so there is nothing to protect.
   */
  async release(key: string, endpoint: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: { key, endpoint, status: 'IN_PROGRESS' },
    });
  }

  /** Removes expired keys. Safe to run at any time. */
  async prune(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }
}
