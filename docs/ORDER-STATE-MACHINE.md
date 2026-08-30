# Top Token: order, payment and inventory state machine

The legal relationships between an order, its payment and the stock it holds.
Everything here is enforced in code by `PaymentStateService`, which is the only
service permitted to move any of the three. Controllers never write a status.

## Why one service owns all three

An order status, a payment status and a reservation status are three views of
one fact: whether the customer has bought the thing. Letting two callers each
update one of them is how a system ends up paid with no stock, or holding stock
nobody paid for. Centralising the transitions makes the illegal combinations
unreachable rather than merely unlikely.

## The states

**Order** (`OrderStatus`, matching the frontend domain member for member):
`PENDING_PAYMENT`, `PAYMENT_PROCESSING`, `PAID`, `FULFILLMENT_PENDING`,
`CANCELLED`, `REFUND_PENDING`. `DRAFT`, `PROCESSING`, `FULFILLMENT_PROCESSING`,
`FULFILLED`, `FAILED` and `REFUNDED` exist in the vocabulary and are not yet
written by any code path.

**Payment** (`PaymentStatus`): `CREATED`, `REQUIRES_ACTION`, `PROCESSING`,
`SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`. The first three are *live*; an
order may have at most one live intent, enforced by a partial unique index.
`EXPIRED` is internal and is translated to `CANCELLED` at the DTO boundary,
because the frontend domain has no member for it.

**Reservation** (`ReservationStatus`): `HELD`, `COMMITTED`, `RELEASED`,
`EXPIRED`.

## The happy path

| Step | Order | Payment | Reservation |
|---|---|---|---|
| Order created | `PENDING_PAYMENT` | none | `HELD` |
| Intent opened | `PENDING_PAYMENT` | `CREATED` | `HELD` |
| Provider working | `PAYMENT_PROCESSING` | `PROCESSING` | `HELD` |
| Payment succeeds | `PAID` then `FULFILLMENT_PENDING` | `SUCCEEDED` | `COMMITTED` |

`PAID` and `FULFILLMENT_PENDING` are written in the same transaction, so `PAID`
is a moment rather than a resting state. Fulfillment rows are created `PENDING`
at the same time. Nothing marks them delivered: no supplier is connected and no
code is invented.

## Failure paths

| Event | Order | Payment | Reservation |
|---|---|---|---|
| Declined | unchanged (`PENDING_PAYMENT`) | `FAILED` | `HELD` |
| Customer cancels | `CANCELLED` | `CANCELLED` | `RELEASED` |
| Payment never completed | `CANCELLED` | `EXPIRED` | `RELEASED` |
| Hold outlives its deadline | unchanged | unchanged | `EXPIRED` |
| Success arrives after cancellation | `REFUND_PENDING` | `SUCCEEDED` | already released |

A decline deliberately leaves the order payable. The customer can try another
instrument, and their stock stays held until the reservation expires on its own.
Releasing it the moment a first card is refused would punish an ordinary
mistake.

The last row is the uncomfortable one and it is handled explicitly. If expiry
cancels an order and the provider then reports success, the money is real. The
payment stays `SUCCEEDED` and the order becomes `REFUND_PENDING`, which is
visible and actionable. Marking it paid would claim stock that was released;
discarding the success would lose a payment.

## Combinations that must never exist

- Order `PAID` or `FULFILLMENT_PENDING` with no `SUCCEEDED` payment.
- Order `PAID` with a `RELEASED` or `EXPIRED` reservation.
- A `COMMITTED` reservation with no `SUCCEEDED` payment.
- Order `CANCELLED` with a `COMMITTED` reservation.
- More than one live payment intent for an order.
- `quantity_reserved` greater than `quantity_available`, or either below zero.

The last two are enforced by PostgreSQL: a partial unique index on
`payment_intents (order_id) WHERE status IN ('CREATED','REQUIRES_ACTION','PROCESSING')`,
and the `inventory_reserved_within_available` and `inventory_counts_not_negative`
CHECK constraints. The rest are enforced by the transitions being centralised,
and asserted directly by the integration tests.

## How concurrency is handled

Every transition is a conditional `UPDATE` that names the states it is allowed
to move from, and the row count decides the outcome. Nothing reads a status and
then writes one.

Settlement and expiry both gate on the order row:

```sql
-- settlement
UPDATE orders SET status = 'PAID'
 WHERE id = $1 AND status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING');

-- expiry
UPDATE orders SET status = 'CANCELLED'
 WHERE id = $1 AND status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING');
```

PostgreSQL serialises the two against the same row, so exactly one changes it
and the loser sees a count of zero. The stock movement happens in the same
transaction as the winning update, so the two can never disagree.

Reservations are claimed the same way:

```sql
UPDATE inventory_reservations SET status = 'COMMITTED'
 WHERE order_id = $1 AND status = 'HELD'
RETURNING offer_id, quantity;
```

Only the returned rows are applied to `inventory`, so a second concurrent commit
claims nothing and moves nothing. The same shape covers release and expiry,
which is what makes the housekeeping sweep safe to run on every instance at once.

## Webhooks

A provider event is untrusted until its signature is verified over the raw
request bytes, and it is rejected if its timestamp is more than five minutes
old. Accepted events are inserted into `payment_events`, whose unique index on
`(provider, provider_event_id)` makes a duplicate delivery, including two
arriving simultaneously, apply exactly once. Only then is the outcome handed to
the state machine, which applies its own conditional updates on top.

Nothing about the browser is consulted. A client cannot declare a payment
successful, and there is no endpoint through which it could try.

## What is not implemented

Refunds have a status and no mechanism. `REFUND_PENDING` is raised by the race
above and has to be resolved by a person. Fulfillment stops at `PENDING`.
Nothing sends email; the notification service records what it would have sent.
