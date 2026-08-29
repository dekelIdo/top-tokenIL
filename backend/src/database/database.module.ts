import { Global, Module, OnModuleInit } from '@nestjs/common';

import { ReadinessRegistry } from '../modules/health/readiness.registry';
import { HealthModule } from '../modules/health/health.module';
import { PrismaService } from './prisma.service';

/**
 * Database access, and the readiness check that makes `/ready` mean something.
 *
 * Registering the check here rather than in the health module keeps the
 * dependency pointing the right way: health knows nothing about PostgreSQL, it
 * just runs whatever indicators were registered with it.
 */
@Global()
@Module({
  imports: [HealthModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ReadinessRegistry,
  ) {}

  onModuleInit(): void {
    this.readiness.register({
      name: 'database',
      check: async () => {
        try {
          await this.prisma.ping();
          return { ok: true };
        } catch (error) {
          // The detail is a safe summary. A driver error can name the host and
          // the credentials, and readiness is an unauthenticated endpoint.
          return {
            ok: false,
            detail: error instanceof Error ? 'database unreachable' : 'database check failed',
          };
        }
      },
    });
  }
}
