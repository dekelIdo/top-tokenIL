import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { ReadinessRegistry } from './readiness.registry';

const startedAt = Date.now();

/**
 * Liveness and readiness.
 *
 * Deliberately unauthenticated so a platform health checker can reach them, and
 * deliberately thin: no version control metadata, no dependency versions, no
 * configuration values. A health endpoint is an unauthenticated window into the
 * service, so it shows only what an operator genuinely needs.
 */
@Controller('health')
export class HealthController {
  @Get()
  live(): { status: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }
}

@Controller('ready')
export class ReadinessController {
  constructor(
    private readonly registry: ReadinessRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async ready(@Res() response: Response): Promise<void> {
    const { ok, results } = await this.registry.run();

    // 503 rather than 200-with-a-flag: an orchestrator reads the status code.
    response.status(ok ? 200 : 503).json({
      status: ok ? 'ready' : 'not-ready',
      environment: this.config.nodeEnv,
      checks: this.registry.registered.length === 0 ? 'none registered' : results,
    });
  }
}
