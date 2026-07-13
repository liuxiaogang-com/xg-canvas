import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssetModule } from '../asset/asset.module';
import { AuthzModule } from '../authz/authz.module';
import { Canvas, CanvasNode, Task } from '../database/entities';
import { LibraryModule } from '../library/library.module';
import { ProjectModule } from '../project/project.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { TaskController } from './task.controller';
import { MockExecutorService } from './mock-executor.service';
import { TaskExecutorService } from './task-executor.service';
import { TaskExecutionStore } from './task-execution.store';
import { TaskNodeWritebackService } from './task-node-writeback.service';
import { TaskPollerService } from './task-poller.service';
import { TaskRunnerService } from './task-runner.service';
import { TaskService } from './task.service';
import { TaskTerminalService } from './task-terminal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, CanvasNode, Canvas]),
    AuthzModule,
    ProjectModule,
    WorkspaceModule,
    LibraryModule,
    forwardRef(() => AssetModule),
  ],
  controllers: [TaskController],
  providers: [
    TaskService,
    TaskExecutionStore,
    TaskExecutorService,
    MockExecutorService,
    TaskPollerService,
    TaskRunnerService,
    TaskNodeWritebackService,
    TaskTerminalService,
  ],
  exports: [TaskService],
})
export class TaskModule {}
