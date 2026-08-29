import { Global, Module } from '@nestjs/common';

import { AppLogger } from './app-logger.service';

/**
 * Logging is available everywhere without each module importing it.
 *
 * Global because every module logs, and threading a LoggingModule import
 * through all of them would be noise that hides the real dependencies.
 */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggingModule {}
