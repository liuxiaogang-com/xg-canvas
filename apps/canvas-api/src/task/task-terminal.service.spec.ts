import type { DataSource, EntityManager } from 'typeorm';

import type { AccountInvokeClient } from '../account-client';
import type { AssetService } from '../asset/asset.service';
import type { Task } from '../database/entities';
import type { RequestLogService } from '../request-log/request-log.service';
import type { TaskNodeWritebackService } from './task-node-writeback.service';
import { TaskTerminalService } from './task-terminal.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const LEASE = '33333333-3333-4333-8333-333333333333';
const CHANNEL_RESOURCE_UID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_REVISION_ID = '88888888-8888-4888-8888-888888888888';
const CHANNEL_ROUTE = { key: 'test', base_url: 'https://vendor.test', options: {} };
const CREDENTIAL_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';
const PIN = {
  model_resource_uid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  model_revision_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  rate_card_revision_id: null,
  catalog_epoch: '7',
};

describe('TaskTerminalService', () => {
  const manager = {
    query: jest.fn(),
  } as unknown as EntityManager;
  const ds = {
    transaction: jest.fn(async (work: (value: EntityManager) => unknown) => work(manager)),
  } as unknown as DataSource;
  const assets = {
    persistProduced: jest.fn(),
    discardProduced: jest.fn(),
  } as unknown as AssetService;
  const writeback = { applyTerminal: jest.fn() } as unknown as TaskNodeWritebackService;
  const invoke = { cancel: jest.fn() } as unknown as AccountInvokeClient;
  const requestLogs = { finalizePending: jest.fn() } as unknown as RequestLogService;

  let service: TaskTerminalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskTerminalService(ds, assets, writeback, invoke, requestLogs);
    (assets.persistProduced as jest.Mock).mockResolvedValue(['asset-1']);
    (assets.discardProduced as jest.Mock).mockResolvedValue(undefined);
    (writeback.applyTerminal as jest.Mock).mockResolvedValue(true);
    (invoke.cancel as jest.Mock).mockResolvedValue(undefined);
    (requestLogs.finalizePending as jest.Mock).mockResolvedValue(true);
  });

  it('commits assets, terminal state, and node projection in one transaction', async () => {
    const running = task({ status: 'running', lease_token: LEASE, invoke_request_id: REQUEST_ID });
    const succeeded = task({
      status: 'succeeded',
      output_asset_ids: ['asset-1'],
      lease_token: null,
      invoke_request_id: REQUEST_ID,
    });
    (manager.query as jest.Mock)
      .mockResolvedValueOnce([running])
      .mockResolvedValueOnce([succeeded]);

    await expect(
      service.succeed(TASK_ID, LEASE, {
        assets: [],
        text: 'done',
        usage: { image_count: 1 },
      }),
    ).resolves.toBe(true);

    expect(assets.persistProduced).toHaveBeenCalledWith(running, [], manager);
    expect(writeback.applyTerminal).toHaveBeenCalledWith(succeeded, manager);
    expect(ds.transaction).toHaveBeenCalledTimes(1);
    expect(requestLogs.finalizePending).toHaveBeenCalledWith(
      REQUEST_ID,
      {
        status: 'success',
        usage: { image_count: 1 },
        response_body: { text: 'done' },
      },
      manager,
    );
  });

  it('performs no side effects after a lease has been lost', async () => {
    (manager.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(service.succeed(TASK_ID, LEASE, { assets: [] })).resolves.toBe(false);

    expect(assets.persistProduced).not.toHaveBeenCalled();
    expect(writeback.applyTerminal).not.toHaveBeenCalled();
    expect(assets.discardProduced).toHaveBeenCalledWith([]);
  });

  it('does not swallow a node write-back failure', async () => {
    (manager.query as jest.Mock)
      .mockResolvedValueOnce([task({ status: 'running', lease_token: LEASE })])
      .mockResolvedValueOnce([task({ status: 'failed', lease_token: null })]);
    (writeback.applyTerminal as jest.Mock).mockRejectedValueOnce(new Error('writeback failed'));

    await expect(service.fail(TASK_ID, LEASE, 'VENDOR_REJECTED', 'nope')).rejects.toThrow(
      'writeback failed',
    );
  });

  it('keeps Task and pending request-log terminal writes in the same transaction boundary', async () => {
    const running = task({
      status: 'running',
      lease_token: LEASE,
      invoke_request_id: REQUEST_ID,
    });
    const failed = task({ ...running, status: 'failed', lease_token: null });
    (manager.query as jest.Mock).mockResolvedValueOnce([running]).mockResolvedValueOnce([failed]);
    (requestLogs.finalizePending as jest.Mock).mockRejectedValueOnce(
      new Error('log update failed'),
    );

    await expect(service.fail(TASK_ID, LEASE, 'VENDOR_REJECTED', 'nope')).rejects.toThrow(
      'log update failed',
    );

    expect(requestLogs.finalizePending).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.any(Object),
      manager,
    );
    expect(invoke.cancel).not.toHaveBeenCalled();
  });

  it('wins cancellation under the row lock and then cancels the vendor best-effort', async () => {
    const running = task({
      status: 'running',
      lease_token: LEASE,
      external_task_id: 'vendor-1',
      channel_resource_uid: CHANNEL_RESOURCE_UID,
      credential_id: CREDENTIAL_ID,
      invoke_request_id: REQUEST_ID,
    });
    const cancelled = task({ ...running, status: 'cancelled', lease_token: null });
    (manager.query as jest.Mock)
      .mockResolvedValueOnce([running])
      .mockResolvedValueOnce([cancelled]);

    await expect(service.cancelByOwner(USER_ID, TASK_ID)).resolves.toMatchObject({
      status: 'cancelled',
    });

    expect(writeback.applyTerminal).toHaveBeenCalledWith(cancelled, manager);
    expect(invoke.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        ...PIN,
        external_task_id: 'vendor-1',
        model_id: 'test:model',
        channel_resource_uid: CHANNEL_RESOURCE_UID,
        credential_id: CREDENTIAL_ID,
      }),
    );
    expect(requestLogs.finalizePending).toHaveBeenCalledWith(
      REQUEST_ID,
      {
        status: 'cancelled',
      },
      manager,
    );
  });

  it('does not call the vendor again when cancel is repeated on a terminal task', async () => {
    const succeeded = task({
      status: 'succeeded',
      external_task_id: 'vendor-1',
      channel_resource_uid: CHANNEL_RESOURCE_UID,
      credential_id: CREDENTIAL_ID,
    });
    (manager.query as jest.Mock).mockResolvedValueOnce([succeeded]);

    await expect(service.cancelByOwner(USER_ID, TASK_ID)).resolves.toMatchObject({
      status: 'succeeded',
    });

    expect(invoke.cancel).not.toHaveBeenCalled();
    expect(writeback.applyTerminal).not.toHaveBeenCalled();
  });

  it('best-effort cancels an external job when local polling fails terminally', async () => {
    const running = task({
      status: 'running',
      lease_token: LEASE,
      external_task_id: 'vendor-1',
      channel_resource_uid: CHANNEL_RESOURCE_UID,
      credential_id: CREDENTIAL_ID,
      invoke_request_id: REQUEST_ID,
    });
    const failed = task({ ...running, status: 'failed', lease_token: null });
    (manager.query as jest.Mock).mockResolvedValueOnce([running]).mockResolvedValueOnce([failed]);

    await expect(service.fail(TASK_ID, LEASE, 'VENDOR_TIMEOUT', 'timeout')).resolves.toBe(true);

    expect(invoke.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        ...PIN,
        external_task_id: 'vendor-1',
        model_id: 'test:model',
        channel_resource_uid: CHANNEL_RESOURCE_UID,
        credential_id: CREDENTIAL_ID,
      }),
    );
    expect(requestLogs.finalizePending).toHaveBeenCalledWith(
      REQUEST_ID,
      {
        status: 'timeout',
        error_code: 'VENDOR_TIMEOUT',
        error_message: 'timeout',
      },
      manager,
    );
  });

});

function task(patch: Partial<Task>): Task {
  return {
    id: TASK_ID,
    owner_id: USER_ID,
    workspace_id: WORKSPACE_ID,
    model_id: 'test:model',
    ...PIN,
    status: 'running',
    output_asset_ids: [],
    invoke_request_id: null,
    invoke_logical_request_id: null,
    invoke_prepared_at: null,
    channel_revision_id: CHANNEL_REVISION_ID,
    channel_route: CHANNEL_ROUTE,
    ...patch,
  } as Task;
}
