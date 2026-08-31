import { Module } from '@nestjs/common';

import { FulfillmentService } from './fulfillment.service';

/**
 * Fulfillment has no controller of its own.
 *
 * Customers reach it through the order endpoints and operators through the
 * admin API, so the module exports a service and owns no routes. Keeping the
 * state machine out of both controllers is what stops the two from drifting
 * into disagreeing about what a delivered order is.
 */
@Module({
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
