import { Module } from '@nestjs/common';

import { HealthController, ReadinessController } from './health.controller';
import { ReadinessRegistry } from './readiness.registry';

@Module({
  controllers: [HealthController, ReadinessController],
  providers: [ReadinessRegistry],
  exports: [ReadinessRegistry],
})
export class HealthModule {}
