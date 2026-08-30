import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { unauthorizedError } from '../../common/errors/api-error';
import { PrismaService } from '../../database/prisma.service';
import { OrderAccessService } from '../orders/order-access.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { RequestCodeDto, UpdateProfileDto, VerifyCodeDto } from './dto/auth.dto';
import { MeResponse, toCustomerResponse, toMeResponse } from './dto/customer.mapper';

/**
 * Sign-in, sign-out and the current customer.
 *
 * Every response here is deliberately uninformative about whether an address
 * exists. See `AuthService` for why that is structural rather than a branch.
 */
@Controller()
export class CustomersController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessService,
  ) {}

  /**
   * Requests a sign-in code.
   *
   * Always 204, whether the address is known, unknown or malformed past basic
   * shape validation. The response body carries the code only when the
   * development echo is enabled, which configuration validation refuses outside
   * local development.
   */
  @Post('auth/request-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestCode(
    @Body() body: RequestCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.auth.requestCode(body.email, request.ip ?? null);

    if (result.devCode) {
      // A header rather than a body, because a 204 has no body. Present only in
      // local development.
      response.setHeader('X-Dev-Otp', result.devCode);
    }
  }

  /**
   * Verifies a code and starts an authenticated session.
   *
   * The session is rotated here: any pre-authentication token is revoked and a
   * new one issued, which is what prevents session fixation.
   *
   * Orders the visitor placed as a guest are transferred to the customer before
   * the rotation. Without that step the rotation itself would strand them: the
   * order is owned by a session that sign-in has just revoked, and nobody could
   * ever read it again.
   */
  @Post('auth/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body() body: VerifyCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const customer = await this.auth.verifyCode(body.email, body.code, request.ip ?? null);

    const previous = await this.sessions.resolve(request);
    if (previous) {
      await this.orderAccess.claimSessionOrders(previous.id, customer.id);
    }

    await this.sessions.attachToCustomer(request, response, customer.id);
    return toMeResponse(customer);
  }

  /** Revokes the session server-side and clears the cookie. */
  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.signOut(request, response);
  }

  /** Who the caller is. Anonymous is a normal answer, not an error. */
  @Get('me')
  async me(@Req() request: Request): Promise<MeResponse> {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      return toMeResponse(null);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: session.customerId },
    });
    return toMeResponse(customer);
  }

  /**
   * Updates the caller's own profile.
   *
   * Email is deliberately absent: changing it would move the identity the
   * sign-in flow is built on, and needs its own verification.
   */
  @Patch('me')
  async updateProfile(@Body() body: UpdateProfileDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Profile update requires an authenticated session');
    }

    const customer = await this.prisma.customer.update({
      where: { id: session.customerId },
      data: {
        displayName: body.displayName,
        phone: body.phone,
        preferredLocale: body.preferredLocale,
        preferredRegion: body.preferredRegion as never,
      },
    });

    return toCustomerResponse(customer);
  }
}
