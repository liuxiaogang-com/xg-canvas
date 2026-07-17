import { Module } from '@nestjs/common';

import { AccountClientModule } from '../account-client';
import { ModelsController } from './models.controller';

@Module({
  imports: [AccountClientModule],
  controllers: [ModelsController],
})
export class ModelsModule {}
