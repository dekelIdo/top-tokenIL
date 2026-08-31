import { Module } from '@nestjs/common';

import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';

@Module({
  imports: [FulfillmentModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard],
})
export class AdminModule {}
