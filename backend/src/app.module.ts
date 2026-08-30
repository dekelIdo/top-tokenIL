import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { CorrelationMiddleware } from './common/interceptors/correlation.middleware';
import { LoggingModule } from './common/logging/logging.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ContentModule } from './modules/content/content.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';

/**
 * The application root.
 *
 * A modular monolith: one deployable, partitioned by feature module, each owning
 * its own repositories and exposing a small interface. Catalog, cart, checkout,
 * customers and order reads are registered; payment and fulfillment arrive in a
 * later phase and slot in here without changing anything below.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    HealthModule,
    DatabaseModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    ContentModule,
    CustomersModule,
    OrdersModule,
  ],
  providers: [ApiExceptionFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Applied to every route including health, so even a failing health probe
    // is traceable to a request id.
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
