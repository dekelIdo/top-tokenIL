import { Module } from '@nestjs/common';

import { CartModule } from '../cart/cart.module';
import { CustomersModule } from '../customers/customers.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [CartModule, CustomersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
