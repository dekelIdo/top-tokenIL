import { Module } from '@nestjs/common';

import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { OrderAccessService } from '../orders/order-access.service';
import { AuthService } from './auth.service';
import { CustomersController } from './customers.controller';
import { SessionService } from './session.service';

@Module({
  controllers: [CustomersController],
  // OrderAccessService is listed here rather than imported from OrdersModule,
  // which already imports this module: importing it back would be a cycle. The
  // service holds no state beyond Prisma, so a second instance is equivalent.
  providers: [AuthService, SessionService, RateLimitService, OrderAccessService],
  exports: [SessionService],
})
export class CustomersModule {}
