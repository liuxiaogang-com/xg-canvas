import { Module } from '@nestjs/common';

import { DreaminaController } from './dreamina.controller';
import { DreaminaService } from './dreamina.service';
import { DreaminaCliRunner } from './dreamina-cli.runner';

@Module({
  controllers: [DreaminaController],
  providers: [DreaminaService, DreaminaCliRunner],
  exports: [DreaminaService, DreaminaCliRunner],
})
export class DreaminaModule {}
