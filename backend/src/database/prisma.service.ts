import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppLogger } from '../common/logging/app-logger.service';
import { APP_CONFIG } from '../config/config.module';
import { AppConfig } from '../config/environment';

/**
 * The Prisma client, with a lifecycle Nest can manage.
 *
 * Connecting in `onModuleInit` means a bad `DATABASE_URL` surfaces at startup
 * rather than on the first customer request. Disconnecting in `onModuleDestroy`
 * lets a deploy drain cleanly instead of dropping in-flight transactions.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly logger: AppLogger,
  ) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      // Queries are logged only where a developer asked for them; a production
      // query log would leak customer data into stdout.
      log: config.logLevel === 'debug' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.info('database disconnected');
  }

  /**
   * Cheap liveness probe for the readiness endpoint. `SELECT 1` verifies the
   * connection is genuinely usable, which a pool that merely exists does not.
   */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
