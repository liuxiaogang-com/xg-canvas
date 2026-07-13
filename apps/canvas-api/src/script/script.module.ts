import { Module } from '@nestjs/common';

import { CanvasModule } from '../canvas/canvas.module';
import { ProjectModule } from '../project/project.module';
import { LlmExtractService } from './llm-extract.service';
import { ScriptController } from './script.controller';
import { ScriptService } from './script.service';

@Module({
  imports: [CanvasModule, ProjectModule],
  controllers: [ScriptController],
  providers: [ScriptService, LlmExtractService],
})
export class ScriptModule {}
