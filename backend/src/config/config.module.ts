import { Global, Module } from '@nestjs/common';

import { AppConfig, validateEnvironment } from './environment';

/** DI token for the validated, immutable application configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Configuration is validated once, at module construction, so a misconfigured
 * process fails during bootstrap rather than on the first request that happens
 * to need the missing value.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => validateEnvironment(process.env),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
