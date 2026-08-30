import { Global, Module } from '@nestjs/common';

import { NotificationService } from './notification.service';

/**
 * Global so that any module can notify without importing a chain of others.
 * Nothing here depends on payment or order internals, which is the point.
 */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
