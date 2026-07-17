import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import type { TaskType } from '@xgcanvas/shared-types';
import type { ModelRevisionPin } from '@xgcanvas/shared-types';
import { ConfigService } from '@nestjs/config';

import { AuthzService } from '../authz/authz.service';
import { Task } from '../database/entities';
import { ProjectService } from '../project/project.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { TaskStatus } from './state-machine';
import type { CreateTaskDto } from './dto/task.dto';
import {
  TaskExecutionStore,
  type ClaimedTask,
  type ExternalTaskCorrelation,
} from './task-execution.store';
import { validatePublicTaskInputs } from './task-input.validator';
import { TaskTerminalService } from './task-terminal.service';
import { AccountModelsClient } from '../account-client';
import { TaskRetryService } from './task-retry.service';

export type { ClaimedTask } from './task-execution.store';

export interface TaskListQuery {
  workspace_id: string;
  project_id?: string;
  status?: TaskStatus;
  limit?: number;
  before?: string; // created_at cursor (ISO)
  standalone?: boolean;
  /** Only resumable tasks that have not been superseded on the same source node. */
  active?: boolean;
}

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly projects: ProjectService,
    private readonly workspaces: WorkspaceService,
    private readonly authz: AuthzService,
    private readonly ds: DataSource,
    private readonly terminal: TaskTerminalService,
    private readonly execution: TaskExecutionStore,
    private readonly accountModels: AccountModelsClient,
    private readonly retryTasks: TaskRetryService,
    config: ConfigService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true';
  }

  private readonly demoMode: boolean;

  async create(userId: string, workspaceId: string, dto: CreateTaskDto): Promise<Task> {
    // Re-verify workspace membership on every create — the session's workspace_id
    // is set at login and never re-checked, so a removed member must be stopped here.
    await this.workspaces.assertMember(userId, workspaceId);
    validatePublicTaskInputs(dto.inputs ?? {});

    if (dto.project_id) {
      // Verifies membership via project service.
      const project = await this.projects.getOrThrow(userId, dto.project_id);
      if (project.workspace_id !== workspaceId) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'project is outside the active workspace',
        });
      }
      const mayRun = await this.authz.can(userId, 'project.task.run', 'project', dto.project_id);
      if (!mayRun) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'project.task.run is required',
        });
      }
    }
    if (dto.source_node_id) {
      if (!dto.project_id) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'source_node_id requires project_id',
        });
      }
      const mayEdit = await this.authz.can(
        userId,
        'project.canvas.node.edit',
        'project',
        dto.project_id,
      );
      if (!mayEdit) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'source node write-back requires project.canvas.node.edit',
        });
      }
      const selection = await this.resolveModelSelection(dto);
      return this.ds.transaction(async (manager) => {
        await this.assertSourceNodeBinding(
          manager,
          dto.source_node_id!,
          dto.project_id!,
          workspaceId,
          true,
        );
        const repo = manager.getRepository(Task);
        return repo.save(repo.create(this.taskValues(userId, workspaceId, dto, selection)));
      });
    }
    const selection = await this.resolveModelSelection(dto);
    return this.tasks.save(this.tasks.create(this.taskValues(userId, workspaceId, dto, selection)));
  }

  private taskValues(
    userId: string,
    workspaceId: string,
    dto: CreateTaskDto,
    selection: { model_id: string; pin: ModelRevisionPin },
  ): Partial<Task> {
    return {
      type: dto.task_type as TaskType,
      status: 'pending',
      model_id: selection.model_id,
      model_resource_uid: selection.pin.model_resource_uid,
      model_revision_id: selection.pin.model_revision_id,
      rate_card_revision_id: selection.pin.rate_card_revision_id,
      catalog_epoch: selection.pin.catalog_epoch,
      execution_mode: this.demoMode ? 'demo' : 'live',
      workspace_id: workspaceId,
      owner_id: userId,
      project_id: dto.project_id ?? null,
      source_node_id: dto.source_node_id ?? null,
      params: dto.params,
      inputs: dto.inputs ?? {},
    };
  }

  private async resolveModelSelection(
    dto: CreateTaskDto,
  ): Promise<{ model_id: string; pin: ModelRevisionPin }> {
    return this.accountModels.resolveTaskPin(
      dto.model_id,
      dto.task_type as TaskType,
      this.demoMode ? 'demo' : 'live',
    );
  }

  async list(userId: string, q: TaskListQuery): Promise<Task[]> {
    const qb = this.tasks
      .createQueryBuilder('t')
      .where('t.owner_id = :uid', { uid: userId })
      .andWhere('t.workspace_id = :wid', { wid: q.workspace_id })
      .orderBy('t.created_at', 'DESC')
      .limit(Math.min(q.limit ?? 50, 200));
    if (q.standalone) qb.andWhere('t.project_id IS NULL');
    else if (q.project_id) qb.andWhere('t.project_id = :pid', { pid: q.project_id });
    if (q.active) {
      qb.andWhere("t.status IN ('pending', 'queued', 'running')");
      // A slow older task must never be resumed over a newer submission for
      // the same node. Terminal write-back uses the same newest-task rule.
      qb.andWhere(`(
        t.source_node_id IS NULL OR NOT EXISTS (
          SELECT 1
            FROM canvas.tasks newer
           WHERE newer.workspace_id = t.workspace_id
             AND newer.project_id = t.project_id
             AND newer.source_node_id = t.source_node_id
             AND (newer.created_at, newer.id) > (t.created_at, t.id)
        )
      )`);
    } else if (q.status) qb.andWhere('t.status = :s', { s: q.status });
    if (q.before) qb.andWhere('t.created_at < :b', { b: q.before });
    return qb.getMany();
  }

  async getOrThrow(userId: string, id: string, workspaceId?: string): Promise<Task> {
    const t = await this.tasks.findOne({ where: { id } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'task not found' });
    if (t.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your task' });
    }
    if (workspaceId && t.workspace_id !== workspaceId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'task not found' });
    }
    return t;
  }

  async cancel(userId: string, id: string): Promise<Task> {
    const task = await this.terminal.cancelByOwner(userId, id);
    if (!task) throw new NotFoundException({ code: 'NOT_FOUND', message: 'task not found' });
    return task;
  }

  async retry(userId: string, workspaceId: string, id: string): Promise<Task> {
    return this.retryTasks.retry(userId, workspaceId, id);
  }

  private async assertSourceNodeBinding(
    executor: Pick<DataSource | EntityManager, 'query'>,
    nodeId: string,
    projectId: string,
    workspaceId: string,
    lock: boolean,
  ): Promise<void> {
    const rows = await executor.query(
      `SELECT n.id
         FROM canvas.canvas_nodes n
         JOIN canvas.canvases c ON c.id = n.canvas_id
         JOIN canvas.projects p ON p.id = c.project_id
        WHERE n.id = $1 AND p.id = $2 AND p.workspace_id = $3
        ${lock ? 'FOR UPDATE OF n' : ''}`,
      [nodeId, projectId, workspaceId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'source node does not belong to the task project',
      });
    }
  }

  claimPending(
    limit: number,
    leaseMs?: number,
    executionModes: Array<'live' | 'demo'> = ['live', 'demo'],
  ): Promise<ClaimedTask[]> {
    return this.execution.claimPending(limit, leaseMs, executionModes);
  }

  isCatalogReady(): boolean {
    return this.accountModels.isReady();
  }

  claimDuePolls(
    limit: number,
    leaseMs?: number,
    executionModes: Array<'live' | 'demo'> = ['live'],
  ): Promise<ClaimedTask[]> {
    return this.execution.claimDuePolls(limit, leaseMs, executionModes);
  }

  startClaimed(task: ClaimedTask, leaseMs?: number): Promise<ClaimedTask | null> {
    return this.execution.startClaimed(task, leaseMs);
  }

  renewLease(id: string, leaseToken: string, leaseMs?: number): Promise<boolean> {
    return this.execution.renewLease(id, leaseToken, leaseMs);
  }

  prepareInvokeAttempt(
    id: string,
    leaseToken: string,
    logicalRequestId: string,
  ): Promise<ClaimedTask | null> {
    return this.execution.prepareInvokeAttempt(id, leaseToken, logicalRequestId);
  }

  async saveExternalResult(
    id: string,
    leaseToken: string,
    patch: ExternalTaskCorrelation,
  ): Promise<boolean> {
    return this.execution.saveExternalResult(id, leaseToken, patch);
  }

  deferInvokeRecovery(id: string, leaseToken: string, nextCheckAt: Date): Promise<boolean> {
    return this.execution.deferInvokeRecovery(id, leaseToken, nextCheckAt);
  }

  attachRecoveredWithoutLease(
    id: string,
    logicalRequestId: string,
    patch: ExternalTaskCorrelation,
  ): Promise<boolean> {
    return this.execution.attachRecoveredWithoutLease(id, logicalRequestId, patch);
  }

  findInternal(id: string): Promise<Task | null> {
    return this.execution.findInternal(id);
  }

  async releasePoll(
    id: string,
    leaseToken: string,
    patch: { progress?: number | null; error?: Task['error']; next_poll_at: Date },
  ): Promise<boolean> {
    return this.execution.releasePoll(id, leaseToken, patch);
  }

  async scheduleRetry(
    id: string,
    leaseToken: string,
    code: string,
    message: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    return this.execution.scheduleRetry(id, leaseToken, code, message, nextAttemptAt);
  }

  /** Retry ingestion/polling for an already-paid vendor task without invoking it again. */
  async schedulePollRetry(
    id: string,
    leaseToken: string,
    code: string,
    message: string,
    nextPollAt: Date,
  ): Promise<boolean> {
    return this.execution.schedulePollRetry(id, leaseToken, code, message, nextPollAt);
  }
}
