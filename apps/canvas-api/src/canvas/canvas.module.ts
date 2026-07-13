import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Canvas, CanvasEdge, CanvasNode, CanvasSnapshot } from '../database/entities';
import { ProjectModule } from '../project/project.module';
import { CanvasController } from './canvas.controller';
import { CanvasMutatorService } from './canvas-mutator.service';
import { CanvasService } from './canvas.service';
import { EdgeService } from './edge.service';
import { NodeService } from './node.service';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [TypeOrmModule.forFeature([Canvas, CanvasNode, CanvasEdge, CanvasSnapshot]), ProjectModule],
  controllers: [CanvasController],
  providers: [CanvasService, NodeService, EdgeService, SnapshotService, CanvasMutatorService],
  exports: [CanvasService, NodeService, EdgeService, CanvasMutatorService],
})
export class CanvasModule {}
