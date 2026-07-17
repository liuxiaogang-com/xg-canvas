import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AccountModelsClient } from '../account-client';
import { AuthzService } from '../authz/authz.service';
import { Task } from '../database/entities';
import { ProjectService } from '../project/project.service';
import { RequestLogService } from '../request-log/request-log.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { requireTaskModelPin } from './task-model-pin';

@Injectable()
export class TaskRetryService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly projects: ProjectService,
    private readonly workspaces: WorkspaceService,
    private readonly authz: AuthzService,
    private readonly ds: DataSource,
    private readonly accountModels: AccountModelsClient,
    private readonly requestLogs: RequestLogService,
  ) {}

  async retry(userId: string, workspaceId: string, id: string): Promise<Task> {
    await this.workspaces.assertMember(userId, workspaceId);
    const current = await this.getOwnedTask(userId, workspaceId, id);
    this.assertRetryableStatus(current);

    if (
      current.invoke_logical_request_id &&
      (await this.requestLogs.hasUnresolvedInvoke(current.invoke_logical_request_id))
    ) {
      throw new ConflictException({
        code: 'INVOKE_ATTEMPT_UNRESOLVED',
        message: 'the previous vendor attempt is still being recovered or cancelled',
      });
    }

    try {
      await this.accountModels.assertTaskPin(requireTaskModelPin(current));
    } catch {
      throw new ConflictException({
        code: 'CATALOG_REVISION_MISSING',
        message: 'task Catalog revision is no longer available',
      });
    }

    await this.assertProjectAccess(userId, workspaceId, current);
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET status = 'queued', external_task_id = NULL, invoke_request_id = NULL,
              invoke_logical_request_id = NULL, invoke_prepared_at = NULL,
              channel_resource_uid = NULL,
              channel_revision_id = NULL, channel_route = NULL, credential_id = NULL,
              progress = NULL, error = NULL, started_at = NULL, finished_at = NULL,
              next_poll_at = NOW(), lease_token = NULL, lease_expires_at = NULL,
              output_asset_ids = '{}', text_output = NULL, json_output = NULL,
              retry_count = retry_count + 1, updated_at = NOW()
        WHERE id = $1 AND owner_id = $2 AND workspace_id = $3
          AND status IN ('failed', 'cancelled')
        RETURNING *`,
      [id, userId, workspaceId],
    );
    const retried = firstRow<Task>(rows);
    if (retried) return retried;

    const latest = await this.getOwnedTask(userId, workspaceId, id);
    this.assertRetryableStatus(latest);
    return latest;
  }

  private async getOwnedTask(userId: string, workspaceId: string, id: string): Promise<Task> {
    const task = await this.tasks.findOne({ where: { id } });
    if (!task) throw new NotFoundException({ code: 'NOT_FOUND', message: 'task not found' });
    if (task.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your task' });
    }
    if (task.workspace_id !== workspaceId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'task not found' });
    }
    return task;
  }

  private assertRetryableStatus(task: Task): void {
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      throw new ForbiddenException({
        code: 'CONFLICT',
        message: 'only failed/cancelled tasks can retry',
      });
    }
  }

  private async assertProjectAccess(
    userId: string,
    workspaceId: string,
    task: Task,
  ): Promise<void> {
    if (!task.project_id) return;

    const project = await this.projects.getOrThrow(userId, task.project_id);
    if (project.workspace_id !== workspaceId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'project is outside the active workspace',
      });
    }
    const mayRun = await this.authz.can(userId, 'project.task.run', 'project', task.project_id);
    if (!mayRun) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'project.task.run is required' });
    }
    if (!task.source_node_id) return;

    const mayEdit = await this.authz.can(
      userId,
      'project.canvas.node.edit',
      'project',
      task.project_id,
    );
    if (!mayEdit) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'project.canvas.node.edit is required',
      });
    }
    const rows = await this.ds.query(
      `SELECT n.id
         FROM canvas.canvas_nodes n
         JOIN canvas.canvases c ON c.id = n.canvas_id
         JOIN canvas.projects p ON p.id = c.project_id
        WHERE n.id = $1 AND p.id = $2 AND p.workspace_id = $3`,
      [task.source_node_id, task.project_id, workspaceId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'source node does not belong to the task project',
      });
    }
  }
}

function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]))
    return result[0][0] as T | undefined;
  return Array.isArray(result) ? (result[0] as T | undefined) : undefined;
}
