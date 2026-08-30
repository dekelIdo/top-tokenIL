import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { SessionService } from '../customers/session.service';
import { ConfirmPaymentDto, CreatePaymentIntentDto } from './dto/payment.dto';
import {
  toPaymentIntentDto,
  toPaymentResultDto,
  toPaymentSessionDto,
} from './dto/payment.mapper';
import { PaymentsService } from './payments.service';

/**
 * Payments.
 *
 * Every endpoint resolves the session and checks ownership, and none of them
 * accepts a status, an amount or a card field. The browser can start a payment
 * and report which instrument the customer chose; what that payment becomes is
 * decided by the provider and recorded by the state machine.
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Opens a payment for the order behind a checkout session.
   *
   * Repeating this returns the intent that already exists rather than opening a
   * second one, so a double-click or a retry after a timeout cannot produce two
   * live payments for one order.
   */
  @Post('payment/intents')
  @HttpCode(HttpStatus.CREATED)
  async createIntent(@Body() body: CreatePaymentIntentDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const intent = await this.payments.createIntent(body.checkoutSessionId, session);
    return toPaymentSessionDto(intent);
  }

  @Post('payment/intents/:id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('id') id: string,
    @Body() body: ConfirmPaymentDto,
    @Req() request: Request,
  ) {
    const session = await this.sessions.resolve(request);
    const intent = await this.payments.confirm(id, body.instrument.token, session);
    return toPaymentResultDto(intent);
  }

  @Post('payment/intents/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const intent = await this.payments.cancel(id, session);
    return toPaymentResultDto(intent);
  }

  @Get('payment/intents/:id')
  async getStatus(@Param('id') id: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const intent = await this.payments.requireOwned(id, session);
    return toPaymentResultDto(intent);
  }

  /** The full intent, for a client that needs the action as well as the status. */
  @Get('payment/intents/:id/detail')
  async getDetail(@Param('id') id: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const intent = await this.payments.requireOwned(id, session);
    return toPaymentIntentDto(intent);
  }
}
