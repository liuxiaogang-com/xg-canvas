import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import type { AccountInvokeClient } from '../account-client';
import type { AssetService } from '../asset/asset.service';
import type { LibraryService } from '../library/library.service';
import type { PresignedUrlService } from '../storage/presigned-url.service';
import { TaskExecutorService } from './task-executor.service';
import type { ClaimedTask, TaskService } from './task.service';
import type { TaskTerminalService } from './task-terminal.service';
import type { TaskInvokeRecoveryService } from './task-invoke-recovery.service';
import { TaskInputResolverService } from './task-input-resolver.service';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const LEASE = '22222222-2222-4222-8222-222222222222';
const CHANNEL_RESOURCE_UID = '33333333-3333-4333-8333-333333333333';
const CHANNEL_REVISION_ID = '77777777-7777-4777-8777-777777777777';
const CHANNEL_ROUTE = { key: 'test', base_url: 'https://vendor.test', options: {} };
const CREDENTIAL_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const MODEL_RESOURCE_UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MODEL_REVISION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PIN = {
  model_resource_uid: MODEL_RESOURCE_UID,
  model_revision_id: MODEL_REVISION_ID,
  rate_card_revision_id: null,
  catalog_epoch: '7',
};

describe('TaskExecutorService lease races', () => {
  const tasks = {
    startClaimed: jest.fn(),
    prepareInvokeAttempt: jest.fn(),
    saveExternalResult: jest.fn(),
    scheduleRetry: jest.fn(),
  } as unknown as TaskService;
  const invoke = { invoke: jest.fn(), cancel: jest.fn() } as unknown as AccountInvokeClient;
  const assets = { getInWorkspaceOrThrow: jest.fn() } as unknown as AssetService;
  const library = { getInWorkspaceOrThrow: jest.fn() } as unknown as LibraryService;
  const urls = { getObject: jest.fn() } as unknown as PresignedUrlService;
  const terminal = {
    succeed: jest.fn(),
    fail: jest.fn(),
    finalizeInvokeRequest: jest.fn(),
  } as unknown as TaskTerminalService;
  const recovery = { recoverClaimed: jest.fn() } as unknown as TaskInvokeRecoveryService;

  let service: TaskExecutorService;
  let startedTask: ClaimedTask;

  beforeEach(() => {
    jest.clearAllMocks();
    const inputs = new TaskInputResolverService(assets, library, urls);
    service = new TaskExecutorService(tasks, invoke, inputs, terminal, recovery);
    (tasks.startClaimed as jest.Mock).mockImplementation(async (value: ClaimedTask) => {
      startedTask = value;
      return value;
    });
    (tasks.prepareInvokeAttempt as jest.Mock).mockImplementation(
      async (_id: string, _lease: string, logicalId: string) => ({
        ...startedTask,
        invoke_logical_request_id: logicalId,
        invoke_prepared_at: new Date(),
      }),
    );
    (invoke.cancel as jest.Mock).mockResolvedValue(undefined);
    (terminal.finalizeInvokeRequest as jest.Mock).mockResolvedValue(undefined);
  });

  it('invokes the exact pinned revision with a stable per-attempt idempotency key', async () => {
    (invoke.invoke as jest.Mock).mockResolvedValue({ status: 'succeeded', assets: [] });
    (terminal.succeed as jest.Mock).mockResolvedValue(true);

    await service.run(claimed());

    expect(invoke.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: { kind: 'pinned', pin: PIN },
        idempotency_key: `task:${TASK_ID}:attempt:7`,
        logical_request_id: expect.any(String),
      }),
      undefined,
    );
  });

  it('fails without scheduling redispatch when the vendor completed before ingestion failed', async () => {
    const error = new AdapterError({
      code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
      message: 'vendor image succeeded but S3 ingestion failed',
      dispatch_outcome: 'accepted',
      accepted_result: { usage: { image_count: 1 }, vendor_request_id: 'vendor-request-1' },
    });
    (error as AdapterError & { request_id?: string }).request_id = REQUEST_ID;
    (invoke.invoke as jest.Mock).mockRejectedValueOnce(error);
    (terminal.fail as jest.Mock).mockResolvedValueOnce(true);

    await service.run(claimed());

    expect(invoke.invoke).toHaveBeenCalledTimes(1);
    expect(tasks.scheduleRetry).not.toHaveBeenCalled();
    expect(terminal.fail).toHaveBeenCalledWith(
      TASK_ID,
      LEASE,
      ERROR_CODES.ASSET_DOWNLOAD_FAILED,
      expect.stringContaining(REQUEST_ID),
    );
  });

  it('never invokes again when recovering a ledgered synchronous vendor success', async () => {
    const task = claimed();
    task.invoke_logical_request_id = '99999999-9999-4999-8999-999999999999';
    (recovery.recoverClaimed as jest.Mock).mockResolvedValueOnce({
      kind: 'failed',
      code: 'INVOKE_RESULT_LOST',
      message: 'vendor succeeded before the Task was committed',
    });
    (terminal.fail as jest.Mock).mockResolvedValueOnce(true);

    await service.run(task);

    expect(recovery.recoverClaimed).toHaveBeenCalledTimes(1);
    expect(invoke.invoke).not.toHaveBeenCalled();
    expect(tasks.scheduleRetry).not.toHaveBeenCalled();
    expect(terminal.fail).toHaveBeenCalledWith(
      TASK_ID,
      LEASE,
      'INVOKE_RESULT_LOST',
      expect.any(String),
    );
  });

  it('cancels a just-created vendor job when local cancellation won the CAS', async () => {
    (invoke.invoke as jest.Mock).mockResolvedValue({
      status: 'running',
      assets: [],
      request_id: REQUEST_ID,
      external_task_id: 'vendor-1',
      channel_resource_uid: CHANNEL_RESOURCE_UID,
      channel_revision_id: CHANNEL_REVISION_ID,
      channel_route: CHANNEL_ROUTE,
      credential_id: CREDENTIAL_ID,
    });
    (tasks.saveExternalResult as jest.Mock).mockResolvedValue(false);

    await service.run(claimed());

    expect(invoke.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        ...PIN,
        external_task_id: 'vendor-1',
        model_id: 'test:model',
        channel_resource_uid: CHANNEL_RESOURCE_UID,
        channel_revision_id: CHANNEL_REVISION_ID,
        channel_route: CHANNEL_ROUTE,
        credential_id: CREDENTIAL_ID,
      }),
    );
    expect(tasks.saveExternalResult).toHaveBeenCalledWith(
      TASK_ID,
      LEASE,
      expect.objectContaining({ invoke_request_id: REQUEST_ID }),
    );
    expect(terminal.finalizeInvokeRequest).toHaveBeenCalledWith(REQUEST_ID, {
      status: 'cancelled',
    });
  });

  it('resolves every asset against the task workspace before invoking', async () => {
    const task = claimed();
    task.inputs = {
      references: [
        { slot: 'source_image', type: 'image', asset_id: '77777777-7777-4777-8777-777777777777' },
      ],
    };
    (assets.getInWorkspaceOrThrow as jest.Mock).mockRejectedValue(new Error('asset not found'));
    (terminal.fail as jest.Mock).mockResolvedValue(true);

    await service.run(task);

    expect(assets.getInWorkspaceOrThrow).toHaveBeenCalledWith(
      task.owner_id,
      '77777777-7777-4777-8777-777777777777',
      task.workspace_id,
    );
    expect(invoke.invoke).not.toHaveBeenCalled();
  });

  it('does not treat an incomplete ready provider ref as an invokable vendor binding', async () => {
    const task = claimed();
    task.inputs = {
      references: [
        {
          slot: 'driving_audio',
          type: 'library_ref',
          library_entry_id: '77777777-7777-4777-8777-777777777777',
        },
      ],
    };
    (library.getInWorkspaceOrThrow as jest.Mock).mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Incomplete voice',
      kind: 'voice',
      project_id: null,
      material: null,
      provider_refs: [
        {
          provider_resource_uid: 'provider-resource',
          external_ref_id: 'voice-1',
          status: 'ready',
        },
      ],
    });

    await service.run(task);

    expect(invoke.invoke).not.toHaveBeenCalled();
    expect(terminal.fail).toHaveBeenCalledWith(
      task.id,
      task.lease_token,
      'VALIDATION_FAILED',
      expect.stringContaining('没有已验证的厂商绑定'),
    );
  });

  it('rejects a project-scoped library entry outside the task project', async () => {
    const task = claimed();
    task.project_id = '88888888-8888-4888-8888-888888888888';
    task.inputs = {
      references: [
        {
          slot: 'source_image',
          type: 'library_ref',
          library_entry_id: '77777777-7777-4777-8777-777777777777',
        },
      ],
    };
    (library.getInWorkspaceOrThrow as jest.Mock).mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Other project style',
      kind: 'style',
      project_id: '99999999-9999-4999-8999-999999999999',
      material: { asset_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
      provider_refs: [],
    });

    await service.run(task);

    expect(assets.getInWorkspaceOrThrow).not.toHaveBeenCalled();
    expect(invoke.invoke).not.toHaveBeenCalled();
  });

  it('rejects an asset whose authoritative type conflicts with the declared reference type', async () => {
    const task = claimed();
    task.inputs = {
      references: [
        {
          slot: 'source_image',
          type: 'image',
          asset_id: '77777777-7777-4777-8777-777777777777',
        },
      ],
    };
    (assets.getInWorkspaceOrThrow as jest.Mock).mockResolvedValue({
      type: 'video',
      mime_type: 'video/mp4',
      storage_key: 'assets/video.mp4',
    });
    (terminal.fail as jest.Mock).mockResolvedValue(true);

    await service.run(task);

    expect(invoke.invoke).not.toHaveBeenCalled();
    expect(urls.getObject).not.toHaveBeenCalled();
    expect(terminal.fail).toHaveBeenCalledWith(
      task.id,
      task.lease_token,
      'VALIDATION_FAILED',
      expect.stringContaining('expects image'),
    );
  });
});

function claimed(): ClaimedTask {
  return {
    id: TASK_ID,
    type: 'gen.image',
    model_id: 'test:model',
    ...PIN,
    status: 'queued',
    external_task_id: null,
    invoke_request_id: null,
    invoke_logical_request_id: null,
    invoke_prepared_at: null,
    channel_resource_uid: null,
    channel_revision_id: null,
    channel_route: null,
    credential_id: null,
    source_node_id: null,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    owner_id: '66666666-6666-4666-8666-666666666666',
    project_id: null,
    params: {},
    inputs: {},
    output_asset_ids: [],
    text_output: null,
    json_output: null,
    progress: null,
    error: null,
    retry_count: 0,
    attempt_no: 7,
    lease_token: LEASE,
    lease_expires_at: new Date(Date.now() + 60_000),
  } as unknown as ClaimedTask;
}
