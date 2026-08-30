import { Inject, Injectable } from '@nestjs/common';
import type { Customer } from '@prisma/client';

import { unauthorizedError } from '../../common/errors/api-error';
import {
  generateId,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { RATE_LIMITS, RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';

export interface RequestCodeResult {
  /**
   * Present only when OTP_DEV_ECHO is on, which configuration validation forbids
   * outside local development. It exists so a developer can sign in without a
   * mail provider, and never reaches a deployed environment.
   */
  readonly devCode?: string;
}

/**
 * Passwordless authentication.
 *
 * There is no password anywhere in this system, so there is nothing to phish,
 * reuse, leak or rotate. A six-digit code is emailed, verified once, and thrown
 * away.
 *
 * Enumeration resistance is structural rather than a branch. Requesting a code
 * does exactly the same work for an address we have never seen as for a known
 * customer: a code row is written either way, and the account is created on
 * first successful verification. There is no "user not found" path to time or
 * to observe, because there is no lookup.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Issues a sign-in code.
   *
   * The caller always receives 204 regardless of what happened here, so nothing
   * observable distinguishes a known address from an unknown one.
   */
  async requestCode(email: string, ip: string | null): Promise<RequestCodeResult> {
    const normalised = this.normaliseEmail(email);

    await this.rateLimit.consume(RATE_LIMITS.otpRequestPerEmail, normalised);
    if (ip) {
      await this.rateLimit.consume(RATE_LIMITS.otpRequestPerIp, ip);
    }

    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    const expiresAt = new Date(Date.now() + this.config.otpTtlSeconds * 1000);

    // Any code still outstanding for this address is retired, so requesting a
    // second code invalidates the first rather than leaving two doors open.
    await this.prisma.authCode.updateMany({
      where: { email: normalised, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authCode.create({
      data: {
        id: generateId('otp'),
        email: normalised,
        codeHash,
        expiresAt,
        requestIp: ip,
      },
    });

    // The code itself is never logged, in any environment.
    this.logger.info('sign-in code issued', { ttlSeconds: this.config.otpTtlSeconds });

    // TODO(phase-D): hand the code to the notification service once an email
    // provider is configured. Until then the only delivery path is the
    // development echo below.
    return this.config.otpDevEcho ? { devCode: code } : {};
  }

  /**
   * Verifies a code and returns the customer, creating the account on first
   * successful sign-in.
   *
   * Account creation here is what makes the flow both a sign-up and a sign-in
   * without the two behaving differently from the outside.
   */
  async verifyCode(email: string, code: string, ip: string | null): Promise<Customer> {
    const normalised = this.normaliseEmail(email);

    if (ip) {
      await this.rateLimit.consume(RATE_LIMITS.otpVerifyPerIp, ip);
    }

    const candidates = await this.prisma.authCode.findMany({
      where: { email: normalised, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const candidate = candidates[0];
    if (!candidate) {
      // Deliberately the same error as a wrong code. Distinguishing "no code
      // pending" from "wrong code" would tell an attacker whether an address is
      // mid-flow.
      throw unauthorizedError(`No pending sign-in code for ${normalised}`, 'INVALID_CODE');
    }

    if (candidate.attempts >= this.config.otpMaxAttempts) {
      await this.consume(candidate.id);
      throw unauthorizedError('Sign-in code exhausted its attempts', 'INVALID_CODE');
    }

    const matches = await verifyOtpCode(code, candidate.codeHash);
    if (!matches) {
      const updated = await this.prisma.authCode.update({
        where: { id: candidate.id },
        data: { attempts: { increment: 1 } },
      });

      // Destroyed rather than left to be guessed at leisure.
      if (updated.attempts >= this.config.otpMaxAttempts) {
        await this.consume(candidate.id);
      }

      throw unauthorizedError('Sign-in code did not match', 'INVALID_CODE');
    }

    // Claiming the code is a conditional update rather than a plain write, and
    // the row count decides the outcome. Two requests arriving with the same
    // code at the same moment both reach this point having verified it; without
    // the `consumedAt: null` condition both would proceed, so a replayed code
    // would work exactly once per concurrent attempt instead of once in total.
    // PostgreSQL serialises the update on the row, so exactly one caller sees a
    // count of 1.
    const claimed = await this.prisma.authCode.updateMany({
      where: { id: candidate.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw unauthorizedError('Sign-in code was already used', 'INVALID_CODE');
    }

    // Every other outstanding code for the address goes with it.
    await this.prisma.authCode.updateMany({
      where: { email: normalised, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const customer = await this.prisma.customer.upsert({
      where: { email: normalised },
      create: {
        id: generateId('cust'),
        email: normalised,
        emailVerified: true,
      },
      // Verifying a code proves control of the address.
      update: { emailVerified: true },
    });

    this.logger.info('customer authenticated', { customerId: customer.id });
    return customer;
  }

  /** Lowercased and trimmed, so casing cannot create a second account. */
  private normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async consume(authCodeId: string): Promise<void> {
    await this.prisma.authCode.update({
      where: { id: authCodeId },
      data: { consumedAt: new Date() },
    });
  }
}
