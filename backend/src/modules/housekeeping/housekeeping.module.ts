import { Module } from '@nestjs/common';

import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { InventoryService } from '../orders/inventory.service';
import { PaymentsModule } from '../payments/payments.module';
import { HousekeepingService } from './housekeeping.service';

@Module({
  imports: [PaymentsModule],
  providers: [HousekeepingService, InventoryService, IdempotencyService, RateLimitService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
