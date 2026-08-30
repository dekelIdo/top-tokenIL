import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { conflictError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';

/** A Prisma client or an open transaction. Reservation only ever runs inside one. */
type Db = Prisma.TransactionClient;

/** How long a hold survives before the sweep may release it back to stock. */
const RESERVATION_TTL_MINUTES = 30;

export interface ReservationRequest {
  readonly offerId: string;
  readonly quantity: number;
}

/**
 * Inventory holds.
 *
 * The rule this file exists to enforce: with N units available, N+1 concurrent
 * buyers must not all succeed. That cannot be done by reading a count and then
 * writing one, because two requests can read the same number before either
 * writes. So the reservation is a single conditional UPDATE whose WHERE clause
 * contains the check:
 *
 *   UPDATE inventory
 *      SET quantity_reserved = quantity_reserved + n
 *    WHERE offer_id = $1
 *      AND (quantity_available IS NULL OR quantity_reserved + n <= quantity_available)
 *
 * PostgreSQL takes a row lock for the duration of the update, so concurrent
 * statements against the same row are serialised and each one re-evaluates the
 * condition against the value the previous one committed. A caller that changes
 * no rows lost the race and is told there is not enough stock.
 *
 * Behind that sits the `inventory_reserved_within_available` CHECK constraint,
 * which makes an over-reservation impossible to write even if this query were
 * ever wrong. The application enforces the rule; the database guarantees it.
 */
@Injectable()
export class InventoryService {
  /**
   * Holds stock for one line, or throws.
   *
   * Throwing inside a transaction is deliberate: it aborts the whole order
   * rather than leaving an order that reserved some of its lines.
   */
  async reserve(
    tx: Db,
    request: ReservationRequest,
    context: { checkoutSessionId: string; orderId: string },
  ): Promise<string> {
    const { offerId, quantity } = request;

    const updated = await tx.$executeRaw`
      UPDATE inventory
         SET quantity_reserved = quantity_reserved + ${quantity},
             updated_at = NOW()
       WHERE offer_id = ${offerId}
         AND status NOT IN ('OUT_OF_STOCK', 'DISCONTINUED')
         AND (
           quantity_available IS NULL
           OR quantity_reserved + ${quantity} <= quantity_available
         )
    `;

    if (updated === 0) {
      // Either the offer has no inventory row, it is withdrawn, or the units
      // are gone. All three mean the same thing to a buyer.
      throw conflictError(
        `Not enough stock to reserve ${quantity} of offer ${offerId}`,
        'OUT_OF_STOCK',
      );
    }

    const reservationId = generateId('rsv');
    await tx.inventoryReservation.create({
      data: {
        id: reservationId,
        offerId,
        checkoutSessionId: context.checkoutSessionId,
        orderId: context.orderId,
        quantity,
        status: 'HELD',
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000),
      },
    });

    return reservationId;
  }

  /**
   * Reserves every line, or none.
   *
   * Lines are reserved in a stable order so that two orders containing the same
   * two offers cannot deadlock by locking the rows in opposite sequences.
   */
  async reserveAll(
    tx: Db,
    requests: readonly ReservationRequest[],
    context: { checkoutSessionId: string; orderId: string },
  ): Promise<string[]> {
    const merged = new Map<string, number>();
    for (const request of requests) {
      merged.set(request.offerId, (merged.get(request.offerId) ?? 0) + request.quantity);
    }

    const ordered = [...merged.entries()].sort(([left], [right]) => left.localeCompare(right));

    const ids: string[] = [];
    for (const [offerId, quantity] of ordered) {
      ids.push(await this.reserve(tx, { offerId, quantity }, context));
    }
    return ids;
  }

  /**
   * Turns holds into sales once payment settles.
   *
   * Reserved units move to sold rather than simply being freed, so the stock
   * that left the shelf is still accounted for.
   */
  async commit(tx: Db, orderId: string): Promise<number> {
    const held = await tx.inventoryReservation.findMany({
      where: { orderId, status: 'HELD' },
    });

    for (const reservation of held) {
      await tx.$executeRaw`
        UPDATE inventory
           SET quantity_reserved = quantity_reserved - ${reservation.quantity},
               quantity_sold = quantity_sold + ${reservation.quantity},
               quantity_available = CASE
                 WHEN quantity_available IS NULL THEN NULL
                 ELSE quantity_available - ${reservation.quantity}
               END,
               updated_at = NOW()
         WHERE offer_id = ${reservation.offerId}
      `;
    }

    await tx.inventoryReservation.updateMany({
      where: { orderId, status: 'HELD' },
      data: { status: 'COMMITTED' },
    });

    return held.length;
  }

  /**
   * Returns held units to the shelf when an order is abandoned or cancelled.
   *
   * Only `HELD` rows are released. A committed reservation belongs to a sale and
   * releasing it would conjure stock that was already delivered.
   */
  async release(tx: Db, orderId: string): Promise<number> {
    const held = await tx.inventoryReservation.findMany({
      where: { orderId, status: 'HELD' },
    });

    for (const reservation of held) {
      await tx.$executeRaw`
        UPDATE inventory
           SET quantity_reserved = GREATEST(0, quantity_reserved - ${reservation.quantity}),
               updated_at = NOW()
         WHERE offer_id = ${reservation.offerId}
      `;
    }

    await tx.inventoryReservation.updateMany({
      where: { orderId, status: 'HELD' },
      data: { status: 'RELEASED' },
    });

    return held.length;
  }

  /**
   * Releases holds that outlived their checkout.
   *
   * Without this, an abandoned basket keeps stock off the shelf forever. Run by
   * housekeeping; safe to call repeatedly.
   */
  async releaseExpired(tx: Db, now = new Date()): Promise<number> {
    const stale = await tx.inventoryReservation.findMany({
      where: { status: 'HELD', expiresAt: { lte: now } },
    });

    for (const reservation of stale) {
      await tx.$executeRaw`
        UPDATE inventory
           SET quantity_reserved = GREATEST(0, quantity_reserved - ${reservation.quantity}),
               updated_at = NOW()
         WHERE offer_id = ${reservation.offerId}
      `;
    }

    await tx.inventoryReservation.updateMany({
      where: { status: 'HELD', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });

    return stale.length;
  }
}
