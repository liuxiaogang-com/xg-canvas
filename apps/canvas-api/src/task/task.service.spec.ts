import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { AuthzService } from '../authz/authz.service';
import type { AccountModelsClient } from '../account-client';
import type { Task } from '../database/entities';
import type { ProjectService } from '../project/project.service';
import type { WorkspaceService } from '../workspace/workspace.service';
import { TaskExecutionStore } from './task-execution.store';
import type { CreateTaskDto } from './dto/task.dto';
import { TaskService } from './task.service';
import type { TaskRetryService } from './task-retry.service';
import type { TaskTerminalService } from './task-terminal.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const NODE_ID = '44444444-4444-4444-8444-444444444444';
const MODEL_RESOURCE_UID = '55555555-5555-4555-8555-555555555555';
const MODEL_REVISION_ID = '66666666-6666-4666-8666-666666666666';

describe('TaskService.create source-node binding', () => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const repo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'task-1', ...value })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as Repository<Task>;
  const projects = { getOrThrow: jest.fn() } as unknown as ProjectService;
  const workspaces = { assertMember: jest.fn() } as unknown as WorkspaceService;
  const authz = { can: jest.fn() } as unknown as AuthzService;
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(() => repo),
  } as unknown as EntityManager;
  const ds = {
    query: jest.fn(),
    transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
  } as unknown as DataSource;
  const terminal = { cancelByOwner: jest.fn() } as unknown as TaskTerminalService;
  const execution = new TaskExecutionStore(ds);
  const accountModels = {
    resolveTaskPin: jest.fn(),
  } as unknown as AccountModelsClient;
  const retryTasks = { retry: jest.fn() } as unknown as TaskRetryService;

  let service: TaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    (repo.findOne as jest.Mock).mockReset();
    queryBuilder.getMany.mockResolvedValue([]);
    service = new TaskService(
      repo,
      projects,
      workspaces,
      authz,
      ds,
      terminal,
      execution,
      accountModels,
      retryTasks,
    );
    (accountModels.resolveTaskPin as jest.Mock).mockResolvedValue({
      model_id: 'test:model',
      pin: {
        model_resource_uid: MODEL_RESOURCE_UID,
        model_revision_id: MODEL_REVISION_ID,
        rate_card_revision_id: null,
        catalog_epoch: '7',
      },
    });
    (projects.getOrThrow as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
    });
    (authz.can as jest.Mock).mockResolvedValue(true);
    (ds.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (manager.query as jest.Mock).mockResolvedValue([{ id: NODE_ID }]);
  });

  it('rejects source_node_id without project_id', async () => {
    await expect(
      service.create(USER_ID, WORKSPACE_ID, dto({ source_node_id: NODE_ID })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a project outside the active workspace', async () => {
    (projects.getOrThrow as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      workspace_id: '55555555-5555-4555-8555-555555555555',
    });
    await expect(
      service.create(
        USER_ID,
        WORKSPACE_ID,
        dto({ project_id: PROJECT_ID, source_node_id: NODE_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires project.canvas.node.edit for write-back tasks', async () => {
    (authz.can as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      service.create(
        USER_ID,
        WORKSPACE_ID,
        dto({ project_id: PROJECT_ID, source_node_id: NODE_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a node that does not belong to the task project', async () => {
    (manager.query as jest.Mock).mockResolvedValue([]);
    await expect(
      service.create(
        USER_ID,
        WORKSPACE_ID,
        dto({ project_id: PROJECT_ID, source_node_id: NODE_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('persists a task only after the project and node checks pass', async () => {
    const task = await service.create(
      USER_ID,
      WORKSPACE_ID,
      dto({ project_id: PROJECT_ID, source_node_id: NODE_ID }),
    );
    expect(authz.can).toHaveBeenCalledWith(
      USER_ID,
      'project.canvas.node.edit',
      'project',
      PROJECT_ID,
    );
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('JOIN canvas.canvases'), [
      NODE_ID,
      PROJECT_ID,
      WORKSPACE_ID,
    ]);
    expect(task).toMatchObject({
      project_id: PROJECT_ID,
      source_node_id: NODE_ID,
      workspace_id: WORKSPACE_ID,
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
    });
    expect(accountModels.resolveTaskPin).toHaveBeenCalledWith('test:model', 'gen.image');
  });

  it('claims work with a durable lease and compare-and-set token', async () => {
    (ds.query as jest.Mock).mockResolvedValueOnce([
      {
        id: 'task-1',
        status: 'queued',
        lease_token: 'lease-1',
        lease_expires_at: new Date(),
        attempt_no: 1,
      },
    ]);

    const claimed = await service.claimPending(3, 45_000);

    expect(claimed).toHaveLength(1);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE SKIP LOCKED[\s\S]+lease_token = gen_random_uuid\(\)/),
      [3, 45_000],
    );
  });

  it('does not accept a stale lease when saving an external task', async () => {
    (ds.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      service.saveExternalResult('task-1', 'stale-lease', {
        external_task_id: 'vendor-1',
        invoke_request_id: '77777777-7777-4777-8777-777777777777',
        invoke_logical_request_id: '88888888-8888-4888-8888-888888888888',
        channel_resource_uid: '99999999-9999-4999-8999-999999999999',
        channel_revision_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        channel_route: { key: 'test', base_url: 'https://vendor.test', options: {} },
        credential_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        next_poll_at: new Date(),
      }),
    ).resolves.toBe(false);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining("lease_token = $2 AND status = 'running'"),
      expect.arrayContaining(['task-1', 'stale-lease', 'vendor-1']),
    );
  });

  it('clears vendor routing and lease state before an automatic retry', async () => {
    (ds.query as jest.Mock).mockResolvedValueOnce([{ id: 'task-1' }]);

    await expect(
      service.scheduleRetry('task-1', 'lease-1', 'VENDOR_TIMEOUT', 'timed out', new Date()),
    ).resolves.toBe(true);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /external_task_id = NULL[\s\S]+channel_resource_uid = NULL[\s\S]+lease_token = NULL/,
      ),
      expect.arrayContaining(['task-1', 'lease-1']),
    );
  });

  it('retries result ingestion without clearing the paid vendor task id', async () => {
    (ds.query as jest.Mock).mockResolvedValueOnce([{ id: 'task-1' }]);

    await expect(
      service.schedulePollRetry(
        'task-1',
        'lease-1',
        'ASSET_DOWNLOAD_FAILED',
        'storage down',
        new Date(),
      ),
    ).resolves.toBe(true);
    const sql = (ds.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('external_task_id IS NOT NULL');
    expect(sql).not.toContain('external_task_id = NULL');
    expect(sql).not.toContain('channel_resource_uid = NULL');
  });

  it('keeps retry as a public delegation to the retry service', async () => {
    const retried = { id: 'task-1', status: 'queued' } as Task;
    (retryTasks.retry as jest.Mock).mockResolvedValueOnce(retried);

    await expect(service.retry(USER_ID, WORKSPACE_ID, 'task-1')).resolves.toBe(retried);
    expect(retryTasks.retry).toHaveBeenCalledWith(USER_ID, WORKSPACE_ID, 'task-1');
  });

  it('keeps task detail isolated to the active workspace', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: 'task-1',
      owner_id: USER_ID,
      workspace_id: '55555555-5555-4555-8555-555555555555',
    });

    await expect(service.getOrThrow(USER_ID, 'task-1', WORKSPACE_ID)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists only active tasks that have not been superseded on the same node', async () => {
    await service.list(USER_ID, {
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      active: true,
    });

    const clauses = queryBuilder.andWhere.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(clauses).toContain("t.status IN ('pending', 'queued', 'running')");
    expect(clauses).toContain('NOT EXISTS');
    expect(clauses).toContain('(newer.created_at, newer.id) > (t.created_at, t.id)');
  });
});

function dto(extra: { project_id?: string; source_node_id?: string }): CreateTaskDto {
  return {
    task_type: 'gen.image',
    model_id: 'test:model',
    params: {},
    inputs: {},
    ...extra,
  };
}
