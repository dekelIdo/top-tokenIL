import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { APP_CONFIG } from '../../../config/config.module';
import { AppConfig } from '../../../config/environment';
import {
  CreateIntentRequest,
  PaymentProvider,
  ProviderEvent,
  ProviderIntent,
  ProviderPaymentStatus,
  ProviderResult,
} from './payment-provider';

/**
 * Scenarios the sandbox can act out, selected by the instrument token.
 *
 * These mirror the tokens the frontend simulator already offers, so switching
 * the app from mock mode to the real backend does not change what a tester can
 * exercise.
 */
const SCENARIOS: Record<string, ProviderPaymentStatus> = {
  sim_success: 'SUCCEEDED',
  sim_declined: 'FAILED',
  sim_cancelled: 'CANCELLED',
  sim_error: 'FAILED',
  sim_timeout: 'PROCESSING',
};

const FAILURE_CODES: Record<string, string> = {
  sim_declined: 'issuer_declined',
  sim_error: 'gateway_error',
};

/** How far out of date a webhook may be before it is treated as a replay. */
const MAX_EVENT_AGE_SECONDS = 300;

/**
 * A payment provider that behaves like an external one.
 *
 * The important word is "behaves". It would be far simpler to have a sandbox
 * that reaches into the orders table and marks things paid, and that shortcut is
 * exactly what this avoids: it mints its own intent ids, it answers questions
 * about payments it owns, and it signs webhooks with a secret. The state machine
 * therefore exercises the same code path a real acquirer will, including
 * signature verification and replay rejection.
 *
 * It holds no card data, because it is never given any. The instrument token
 * selects a scenario and nothing else.
 *
 * SIMULATION ONLY. No money moves. `PAYMENT_MODE=production` is refused by
 * configuration validation precisely so this cannot be mistaken for a real
 * integration.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  readonly id = 'MOCK';
  readonly enabled = true;
  readonly simulated = true;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async createIntent(_request: CreateIntentRequest): Promise<ProviderIntent> {
    return {
      providerIntentId: `sbx_${randomUUID()}`,
      status: 'CREATED',
      action: {
        kind: 'CONFIRM',
        prompt: {
          he: 'זוהי סימולציית תשלום לצורכי פיתוח. בחרו תרחיש ואשרו. לא יתבצע חיוב.',
          en: 'This is a development payment simulation. Pick a scenario and confirm. No charge is made.',
        },
      },
    };
  }

  async confirm(providerIntentId: string, instrumentToken: string): Promise<ProviderResult> {
    const status = SCENARIOS[instrumentToken];

    if (!status) {
      // An unknown instrument fails rather than defaulting to success. Failing
      // toward "not paid" is the only safe direction here.
      return { providerIntentId, status: 'FAILED', failureCode: 'unknown_instrument' };
    }

    return { providerIntentId, status, failureCode: FAILURE_CODES[instrumentToken] };
  }

  async cancel(providerIntentId: string): Promise<ProviderResult> {
    return { providerIntentId, status: 'CANCELLED' };
  }

  /**
   * Verifies a sandbox webhook exactly as a real one would be verified.
   *
   * The signature covers the timestamp and the raw body together, so an attacker
   * who captures a valid delivery cannot replay it later with a fresh timestamp,
   * nor keep the timestamp and change the body.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): ProviderEvent | null {
    const signature = headers['x-tt-signature'];
    const timestamp = headers['x-tt-timestamp'];

    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      return null;
    }

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) {
      return null;
    }

    const ageSeconds = Math.abs(Date.now() / 1000 - sentAt);
    if (ageSeconds > MAX_EVENT_AGE_SECONDS) {
      // Old enough to be a captured delivery being played back.
      return null;
    }

    if (!this.signatureMatches(rawBody, timestamp, signature)) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }

    return this.toEvent(parsed);
  }

  /**
   * Signs a payload the way the provider would.
   *
   * Exported behaviour rather than a test helper: the sandbox is the sender as
   * well as the receiver, so the signing rule has to live with the verifying
   * rule or the two will drift.
   */
  sign(rawBody: Buffer, timestamp: string): string {
    return createHmac('sha256', this.config.paymentWebhookSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
  }

  private signatureMatches(rawBody: Buffer, timestamp: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(rawBody, timestamp), 'utf8');
    const received = Buffer.from(signature, 'utf8');

    if (expected.length !== received.length) {
      return false;
    }
    // Constant time, so the comparison does not leak how much of a forged
    // signature was correct.
    return timingSafeEqual(expected, received);
  }

  /** Reads a verified payload into the provider-independent event shape. */
  private toEvent(parsed: unknown): ProviderEvent | null {
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const eventId = record['id'];
    const type = record['type'];
    const data = record['data'];

    if (typeof eventId !== 'string' || typeof type !== 'string' || !data || typeof data !== 'object') {
      return null;
    }

    const payload = data as Record<string, unknown>;
    const providerIntentId = payload['intentId'];
    const status = payload['status'];

    if (typeof providerIntentId !== 'string' || !this.isProviderStatus(status)) {
      return null;
    }

    const occurredAtRaw = record['occurredAt'];
    const occurredAt = typeof occurredAtRaw === 'string' ? new Date(occurredAtRaw) : new Date();

    return {
      eventId,
      type,
      providerIntentId,
      status,
      failureCode: typeof payload['failureCode'] === 'string' ? payload['failureCode'] : undefined,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      // Only fields we recognise are kept. Storing the raw payload would mean
      // storing whatever a provider decides to add later, sight unseen.
      redactedPayload: {
        type,
        intentId: providerIntentId,
        status,
        failureCode: payload['failureCode'] ?? null,
      },
    };
  }

  private isProviderStatus(value: unknown): value is ProviderPaymentStatus {
    return (
      typeof value === 'string' &&
      ['CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(value)
    );
  }
}
