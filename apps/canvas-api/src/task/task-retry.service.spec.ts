import { ForbiddenException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

import type { AccountModelsClient } from '../account-client';
import type { AuthzService } from '../authz/authz.service';
import type { Task } from '../database/entities';
import type { ProjectService } from '../project/project.service';
import type { RequestLogService } from '../request-log/request-log.service';
import type { WorkspaceService } from '../workspace/workspace.service';
import { TaskRetryService } from './task-retry.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const NODE_ID = '44444444-4444-4444-8444-444444444444';
const MODEL_RESOURCE_UID = '55555555-5555-4555-8555-555555555555';
const MODEL_REVISION_ID = '66666666-6666-4666-8666-666666666666';

describe('TaskRetryService', () => {
  const repo = { findOne: jest.fn() } as unknown as Repository<Task>;
  const projects = { getOrThrow: jest.fn() } as unknown as ProjectService;
  const workspaces = { assertMember: jest.fn() } as unknown as WorkspaceService;
  const authz = { can: jest.fn() } as unknown as AuthzService;
  const ds = { query: jest.fn() } as unknown as DataSource;
  const accountModels = { assertTaskPin: jest.fn() } as unknown as AccountModelsClient;
  const requestLogs = { hasUnresolvedInvoke: jest.fn() } as unknown as RequestLogService;
  const service = new TaskRetryService(
    repo,
    projects,
    workspaces,
    authz,
    ds,
    accountModels,
    requestLogs,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (projects.getOrThrow as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
    });
    (authz.can as jest.Mock).mockResolvedValue(true);
    (accountModels.assertTaskPin as jest.Mock).mockResolvedValue(undefined);
    (requestLogs.hasUnresolvedInvoke as jest.Mock).mockResolvedValue(false);
  });

  it('re-authorizes project permissions before an explicit retry', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(
      task({ project_id: PROJECT_ID, source_node_id: NODE_ID }),
    );
    (authz.can as jest.Mock).mockResolvedValueOnce(false);

    await expect(service.retry(USER_ID, WORKSPACE_ID, 'task-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ds.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET status'),
      expect.anything(),
    );
  });

  it('blocks an explicit retry while the previous vendor attempt remains unresolved', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(
      task({ invoke_logical_request_id: '77777777-7777-4777-8777-777777777777' }),
    );
    (requestLogs.hasUnresolvedInvoke as jest.Mock).mockResolvedValueOnce(true);

    await expect(service.retry(USER_ID, WORKSPACE_ID, 'task-1')).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'INVOKE_ATTEMPT_UNRESOLVED' }),
    });
    expect(accountModels.assertTaskPin).not.toHaveBeenCalled();
  });

  it('fails closed when the immutable Catalog pin cannot be resolved', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(task());
    (accountModels.assertTaskPin as jest.Mock).mockRejectedValueOnce(new Error('missing revision'));

    await expect(service.retry(USER_ID, WORKSPACE_ID, 'task-1')).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'CATALOG_REVISION_MISSING' }),
    });
    expect(ds.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET status'),
      expect.anything(),
    );
  });

  it('keeps the immutable pin and execution mode when explicitly retrying', async () => {
    const current = task({ execution_mode: 'demo' });
    (repo.findOne as jest.Mock).mockResolvedValue(current);
    (ds.query as jest.Mock).mockResolvedValueOnce([{ ...current, status: 'queued' }]);

    await expect(service.retry(USER_ID, WORKSPACE_ID, 'task-1')).resolves.toMatchObject({
      status: 'queued',
      execution_mode: 'demo',
      model_revision_id: MODEL_REVISION_ID,
    });
    expect(accountModels.assertTaskPin).toHaveBeenCalledWith({
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
      rate_card_revision_id: null,
      catalog_epoch: '7',
    });
    const sql = (ds.query as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('channel_resource_uid = NULL');
    expect(sql).not.toContain('model_revision_id =');
    expect(sql).not.toContain('execution_mode =');
  });
});

function task(extra: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    owner_id: USER_ID,
    workspace_id: WORKSPACE_ID,
    project_id: null,
    source_node_id: null,
    status: 'failed',
    model_resource_uid: MODEL_RESOURCE_UID,
    model_revision_id: MODEL_REVISION_ID,
    rate_card_revision_id: null,
    catalog_epoch: '7',
    execution_mode: 'live',
    ...extra,
  } as Task;
}
