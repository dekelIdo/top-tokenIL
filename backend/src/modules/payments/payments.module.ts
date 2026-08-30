import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { OrderAccessService } from '../orders/order-access.service';
import { InventoryService } from '../orders/inventory.service';
import { PaymentStateService } from './payment-state.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';
import { WebhooksController } from './webhooks.controller';

/**
 * OrderAccessService and InventoryService are listed rather than imported from
 * OrdersModule, which already imports the modules this one needs. Both are
 * stateless beyond Prisma, so a second instance behaves identically and the
 * alternative would be a circular import.
 */
@Module({
  imports: [CustomersModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    PaymentStateService,
    SandboxPaymentProvider,
    OrderAccessService,
    InventoryService,
  ],
  exports: [PaymentStateService, SandboxPaymentProvider],
})
export class PaymentsModule {}
