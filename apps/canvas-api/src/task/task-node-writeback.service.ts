import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { applyTaskTerminalProjection } from '../database/task-node-terminal-projection';
import type { Task } from '../database/entities';

@Injectable()
export class TaskNodeWritebackService {
  applyTerminal(task: Task, manager: EntityManager): Promise<boolean> {
    return applyTaskTerminalProjection(task, manager);
  }
}
