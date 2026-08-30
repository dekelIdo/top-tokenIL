import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { ContentController } from './content.controller';

@Module({
  imports: [CustomersModule],
  controllers: [ContentController],
})
export class ContentModule {}
