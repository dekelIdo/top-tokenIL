import { Inject, Injectable } from '@nestjs/common';

import { AppLogger } from '../../common/logging/app-logger.service';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';

/**
 * Customer notifications.
 *
 * Deliberately separate from payment and order code. The only rule that matters
 * here is the one about failure: a notification that cannot be delivered must
 * never undo a payment that has already committed. Callers dispatch after their
 * transaction, and treat an error as an operational problem rather than a
 * business one.
 *
 * No mail provider is connected. The `log` transport records that a message
 * would have been sent and sends nothing, which is why configuration validation
 * refuses it once deployed: a customer whose code was only ever written to a log
 * file has not been served.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async orderPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });

    if (order) {
      this.dispatch('order.paid', orderId, { reference: order.orderNumber });
    }
  }

  async orderCancelled(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });

    if (order) {
      this.dispatch('order.cancelled', orderId, { reference: order.orderNumber });
    }
  }

  /**
   * Hands a message to whichever transport is configured.
   *
   * The recipient address is never logged. An order id and a reference are
   * enough to reconstruct who was notified, without writing a customer's address
   * to disk on every purchase.
   */
  private dispatch(event: string, orderId: string, context: Record<string, string>): void {
    if (this.config.notificationTransport === 'none') {
      return;
    }

    this.logger.info('notification would be sent', {
      event,
      orderId,
      ...context,
      transport: this.config.notificationTransport,
      // Stated plainly so nobody reading a log believes a customer was emailed.
      delivered: false,
    });
  }
}
