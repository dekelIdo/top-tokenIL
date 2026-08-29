import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationMiddleware } from './common/interceptors/correlation.middleware';
import { AppLogger } from './common/logging/app-logger.service';
import { HealthModule } from './modules/health/health.module';

/**
 * The application root.
 *
 * A modular monolith: one deployable, partitioned by feature module, each owning
 * its own repositories and exposing a small interface. Phase A registers only
 * the cross-cutting concerns and health; catalog, cart, checkout, orders,
 * customers, payments and fulfillment arrive in later phases and slot in here
 * without changing anything below.
 */
@Module({
  imports: [AppConfigModule, HealthModule],
  providers: [AppLogger, ApiExceptionFilter],
  exports: [AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route including health, so even a failing health probe
    // is traceable to a request id.
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
