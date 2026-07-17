import type { ConfigService } from '@nestjs/config';

import type { AccountInvokeClient } from '../account-client';
import type { Task } from '../database/entities';
import type {
  AcceptedInvokeOrphan,
  InvokeRecoveryAttempt,
  RequestLogService,
} from '../request-log/request-log.service';
import type { ClaimedTask } from './task-execution.store';
import { TaskInvokeRecoveryService } from './task-invoke-recovery.service';
import type { TaskService } from './task.service';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const LOGICAL_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_LOGICAL_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const LEASE = '55555555-5555-4555-8555-555555555555';
const EXTERNAL_ID = 'vendor-job-1';

describe('TaskInvokeRecoveryService', () => {
  const tasks = {
    saveExternalResult: jest.fn(),
    deferInvokeRecovery: jest.fn(),
    attachRecoveredWithoutLease: jest.fn(),
    findInternal: jest.fn(),
  } as unknown as TaskService;
  const logs = {
    listInvokeRecoveryAttempts: jest.fn(),
    findInvokePreflightFailure: jest.fn(),
    listAcceptedInvokeOrphans: jest.fn(),
    listAbandonedUnknownInvokes: jest.fn(),
    finalizePending: jest.fn(),
    finalizePendingWithoutExternal: jest.fn(),
  } as unknown as RequestLogService;
  const invoke = { cancel: jest.fn() } as unknown as AccountInvokeClient;
  const config = {
    get: jest.fn((key: string) => (key === 'TASK_INVOKE_RECOVERY_TIMEOUT_MS' ? '1000' : undefined)),
  } as unknown as ConfigService;

  let service: TaskInvokeRecoveryService;

  beforeEach(() => {
    jest.resetAllMocks();
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'TASK_INVOKE_RECOVERY_TIMEOUT_MS' ? '1000' : undefined,
    );
    (logs.listInvokeRecoveryAttempts as jest.Mock).mockResolvedValue([]);
    (logs.findInvokePreflightFailure as jest.Mock).mockResolvedValue(null);
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([]);
    (logs.listAbandonedUnknownInvokes as jest.Mock).mockResolvedValue([]);
    (invoke.cancel as jest.Mock).mockResolvedValue(undefined);
    (logs.finalizePending as jest.Mock).mockResolvedValue(true);
    (logs.finalizePendingWithoutExternal as jest.Mock).mockResolvedValue(true);
    service = new TaskInvokeRecoveryService(tasks, logs, invoke, config);
  });

  it('attaches an accepted claimed attempt without cancelling the vendor job', async () => {
    const accepted = recoveryAttempt();
    (logs.listInvokeRecoveryAttempts as jest.Mock).mockResolvedValue([accepted]);
    (tasks.saveExternalResult as jest.Mock).mockResolvedValue(true);

    await expect(service.recoverClaimed(claimedTask())).resolves.toEqual({ kind: 'recovered' });

    expect(tasks.saveExternalResult).toHaveBeenCalledWith(
      TASK_ID,
      LEASE,
      expect.objectContaining({
        external_task_id: EXTERNAL_ID,
        invoke_request_id: ATTEMPT_ID,
        invoke_logical_request_id: LOGICAL_ID,
      }),
    );
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('defers a claimed task while its pending attempt has no accepted external id', async () => {
    const pending = recoveryAttempt({ external_task_id: null });
    (logs.listInvokeRecoveryAttempts as jest.Mock).mockResolvedValue([pending]);
    (tasks.deferInvokeRecovery as jest.Mock).mockResolvedValue(true);

    await expect(service.recoverClaimed(claimedTask())).resolves.toEqual({ kind: 'deferred' });

    expect(tasks.deferInvokeRecovery).toHaveBeenCalledWith(TASK_ID, LEASE, expect.any(Date));
    expect(tasks.saveExternalResult).not.toHaveBeenCalled();
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('fails closed instead of redispatching after a synchronous vendor success was ledgered', async () => {
    (logs.listInvokeRecoveryAttempts as jest.Mock).mockResolvedValue([
      recoveryAttempt({
        status: 'success',
        external_task_id: null,
        error_code: 'ASSET_DOWNLOAD_FAILED',
        error_message: 'vendor completed but asset ingestion failed',
      }),
    ]);

    await expect(service.recoverClaimed(claimedTask())).resolves.toEqual({
      kind: 'failed',
      code: 'INVOKE_RESULT_LOST',
      message: expect.stringContaining('Vendor request succeeded'),
    });
    expect(tasks.deferInvokeRecovery).not.toHaveBeenCalled();
    expect(tasks.saveExternalResult).not.toHaveBeenCalled();
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('fails an unknown claimed outcome after the configured recovery timeout', async () => {
    const task = claimedTask({ invoke_prepared_at: new Date(Date.now() - 2_000) });

    await expect(service.recoverClaimed(task)).resolves.toEqual({
      kind: 'failed',
      code: 'INVOKE_OUTCOME_UNKNOWN',
      message: expect.stringContaining('remained unknown'),
    });

    expect(tasks.deferInvokeRecovery).not.toHaveBeenCalled();
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('skips a background orphan while the matching task lease is active', async () => {
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([
      acceptedOrphan({ task_lease_expires_at: new Date(Date.now() + 60_000) }),
    ]);

    await expect(service.reconcileAcceptedOrphans()).resolves.toBe(0);

    expect(tasks.attachRecoveredWithoutLease).not.toHaveBeenCalled();
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('attaches a background orphan when the matching task has no active lease', async () => {
    const row = acceptedOrphan({ task_lease_expires_at: null });
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([row]);
    (tasks.attachRecoveredWithoutLease as jest.Mock).mockResolvedValue(true);

    await expect(service.reconcileAcceptedOrphans()).resolves.toBe(1);

    expect(tasks.attachRecoveredWithoutLease).toHaveBeenCalledWith(
      TASK_ID,
      LOGICAL_ID,
      expect.objectContaining({
        external_task_id: EXTERNAL_ID,
        invoke_request_id: ATTEMPT_ID,
      }),
    );
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it.each([
    ['terminal task', { task_status: 'cancelled' }],
    [
      'task moved to another logical invocation',
      { task_invoke_logical_request_id: OTHER_LOGICAL_ID },
    ],
  ])('cancels the exact orphan route and finalizes it for a %s', async (_name, overrides) => {
    const row = acceptedOrphan(overrides);
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([row]);

    await expect(service.reconcileAcceptedOrphans()).resolves.toBe(1);

    expect(invoke.cancel).toHaveBeenCalledWith(exactCancelRequest(row));
    expect(logs.finalizePending).toHaveBeenCalledWith(ATTEMPT_ID, { status: 'cancelled' });
    expect(tasks.attachRecoveredWithoutLease).not.toHaveBeenCalled();
  });

  it('leaves an orphan pending when exact vendor cancellation fails', async () => {
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([
      acceptedOrphan({ task_status: 'cancelled' }),
    ]);
    (invoke.cancel as jest.Mock).mockRejectedValue(new Error('vendor unavailable'));

    await expect(service.reconcileAcceptedOrphans()).resolves.toBe(0);

    expect(logs.finalizePending).not.toHaveBeenCalled();
  });

  it('does not cancel after attach CAS loses to a worker that bound the same correlation', async () => {
    const row = acceptedOrphan({ task_lease_expires_at: null });
    (logs.listAcceptedInvokeOrphans as jest.Mock).mockResolvedValue([row]);
    (tasks.attachRecoveredWithoutLease as jest.Mock).mockResolvedValue(false);
    (tasks.findInternal as jest.Mock).mockResolvedValue({
      invoke_request_id: ATTEMPT_ID,
      external_task_id: EXTERNAL_ID,
      channel_resource_uid: row.channel_resource_uid,
      channel_revision_id: row.channel_revision_id,
      credential_id: row.credential_id,
    } as Task);

    await expect(service.reconcileAcceptedOrphans()).resolves.toBe(0);

    expect(tasks.findInternal).toHaveBeenCalledWith(TASK_ID);
    expect(invoke.cancel).not.toHaveBeenCalled();
    expect(logs.finalizePending).not.toHaveBeenCalled();
  });
});

function claimedTask(overrides: Partial<ClaimedTask> = {}): ClaimedTask {
  return {
    id: TASK_ID,
    status: 'running',
    invoke_logical_request_id: LOGICAL_ID,
    invoke_prepared_at: new Date(),
    lease_token: LEASE,
    lease_expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  } as ClaimedTask;
}

function recoveryAttempt(overrides: Partial<InvokeRecoveryAttempt> = {}): InvokeRecoveryAttempt {
  return {
    id: ATTEMPT_ID,
    logical_request_id: LOGICAL_ID,
    attempt_no: 1,
    status: 'pending',
    task_id: TASK_ID,
    owner_id: '66666666-6666-4666-8666-666666666666',
    workspace_id: '77777777-7777-4777-8777-777777777777',
    project_id: '88888888-8888-4888-8888-888888888888',
    model_id: 'test:model',
    model_resource_uid: '99999999-9999-4999-8999-999999999999',
    model_revision_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    rate_card_revision_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    catalog_epoch: '7',
    channel_resource_uid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    channel_revision_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    channel_route: { key: 'test', base_url: 'https://vendor.test', options: { region: 'cn' } },
    credential_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    external_task_id: EXTERNAL_ID,
    error_code: null,
    error_message: null,
    created_at: new Date(),
    ...overrides,
  };
}

function acceptedOrphan(overrides: Partial<AcceptedInvokeOrphan> = {}): AcceptedInvokeOrphan {
  return {
    ...recoveryAttempt(),
    external_task_id: EXTERNAL_ID,
    task_status: 'running',
    task_error: null,
    task_invoke_logical_request_id: LOGICAL_ID,
    task_invoke_request_id: null,
    task_external_task_id: null,
    task_lease_expires_at: null,
    task_channel_resource_uid: null,
    task_channel_revision_id: null,
    task_credential_id: null,
    ...overrides,
  };
}

function exactCancelRequest(row: AcceptedInvokeOrphan) {
  return {
    model_resource_uid: row.model_resource_uid,
    model_revision_id: row.model_revision_id,
    rate_card_revision_id: row.rate_card_revision_id,
    catalog_epoch: row.catalog_epoch,
    task_id: row.task_id,
    external_task_id: row.external_task_id,
    model_id: row.model_id,
    workspace_id: row.workspace_id,
    owner_id: row.owner_id,
    project_id: row.project_id,
    channel_resource_uid: row.channel_resource_uid,
    channel_revision_id: row.channel_revision_id,
    channel_route: row.channel_route,
    credential_id: row.credential_id,
  };
}
