import { Module } from '@nestjs/common';

import { CartController } from './cart.controller';
import { PricingService } from './pricing.service';

@Module({
  controllers: [CartController],
  providers: [PricingService],
  exports: [PricingService],
})
export class CartModule {}
