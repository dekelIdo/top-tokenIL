import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { badRequestError, unauthorizedError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { PaymentStateService } from './payment-state.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

/**
 * The provider webhook boundary.
 *
 * Everything arriving here is untrusted until proven otherwise, including the
 * body, the headers and the timing. The order of checks matters, and it is:
 *
 * 1. Verify the signature over the **raw** bytes. Parsing first and re-encoding
 *    would change whitespace and key order, and the signature would no longer
 *    describe what was actually sent.
 * 2. Reject anything too old to be a live delivery, which is what stops a
 *    captured request being replayed tomorrow.
 * 3. Record the event id. The unique index on (provider, provider_event_id) is
 *    what makes a duplicate delivery, including two arriving at the same
 *    instant, apply exactly once.
 * 4. Only then hand the outcome to the state machine.
 *
 * Nothing about the customer's browser is consulted, and no status the client
 * might claim is read. A webhook is the provider talking to us.
 */
@Controller()
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SandboxPaymentProvider,
    private readonly state: PaymentStateService,
    private readonly logger: AppLogger,
  ) {}

  @Post('webhooks/payments/:provider')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('provider') providerId: string,
    @Req() request: Request,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (providerId !== 'mock') {
      // Only the sandbox exists. Naming an unintegrated provider must not reach
      // any handler at all.
      throw badRequestError(`Unknown payment provider ${providerId}`, 'UNKNOWN_PROVIDER');
    }

    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw badRequestError('A webhook must have a body', 'INVALID_WEBHOOK');
    }

    const event = this.provider.verifyWebhook(rawBody, headers);

    if (!event) {
      // One answer for a bad signature, a stale timestamp and an unparseable
      // body. Telling a forger which check they failed helps them pass it.
      this.logger.warn('rejected a payment webhook', { provider: providerId });
      throw unauthorizedError('Webhook rejected', 'INVALID_WEBHOOK_SIGNATURE');
    }

    const intent = await this.prisma.paymentIntent.findFirst({
      where: { providerIntentId: event.providerIntentId },
    });

    if (!intent) {
      // Acknowledged rather than errored: a provider that receives a failure
      // retries, and retrying will not make an unknown intent appear. The event
      // is logged so an unmatched delivery is visible.
      this.logger.warn('payment webhook referenced an unknown intent', {
        provider: providerId,
        eventType: event.type,
      });
      return { received: true, applied: false };
    }

    // The insert is the deduplication. Two identical deliveries race here and
    // exactly one wins, whatever order they arrive in.
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payment_events (
        id, payment_intent_id, provider, provider_event_id, type,
        status_before, payload_redacted, received_at
      )
      VALUES (
        ${generateId('pev')}, ${intent.id}, 'MOCK'::"PaymentProviderId",
        ${event.eventId}, ${event.type},
        ${intent.status}::"PaymentStatus", ${JSON.stringify(event.redactedPayload)}::jsonb, NOW()
      )
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      this.logger.info('ignored a duplicate payment webhook', {
        intentId: intent.id,
        eventType: event.type,
      });
      return { received: true, applied: false, duplicate: true };
    }

    const outcome = await this.state.settle(intent.id, event.status, {
      failureCode: event.failureCode,
    });

    await this.prisma.paymentEvent.updateMany({
      where: { id: inserted[0].id },
      data: { statusAfter: outcome.paymentStatus },
    });

    return { received: true, applied: outcome.changed };
  }
}
