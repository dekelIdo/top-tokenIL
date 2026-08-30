import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { OrderAccessService } from './order-access.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [CustomersModule],
  controllers: [OrdersController],
  providers: [OrderAccessService],
  exports: [OrderAccessService],
})
export class OrdersModule {}
