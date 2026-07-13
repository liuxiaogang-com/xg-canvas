import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PromptPreset } from '../database/entities';
import { PresetController } from './preset.controller';
import { PresetService } from './preset.service';

@Module({
  imports: [TypeOrmModule.forFeature([PromptPreset])],
  controllers: [PresetController],
  providers: [PresetService],
  exports: [PresetService],
})
export class PresetModule {}
