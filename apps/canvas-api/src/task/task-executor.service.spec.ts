import type { AccountInvokeClient } from '../account-client';
import type { AssetService } from '../asset/asset.service';
import type { LibraryService } from '../library/library.service';
import type { PresignedUrlService } from '../storage/presigned-url.service';
import { TaskExecutorService } from './task-executor.service';
import type { ClaimedTask, TaskService } from './task.service';
import type { TaskTerminalService } from './task-terminal.service';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const LEASE = '22222222-2222-4222-8222-222222222222';
const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';
const CREDENTIAL_ID = '44444444-4444-4444-8444-444444444444';

describe('TaskExecutorService lease races', () => {
  const tasks = {
    startClaimed: jest.fn(),
    saveExternalResult: jest.fn(),
    scheduleRetry: jest.fn(),
  } as unknown as TaskService;
  const invoke = { invoke: jest.fn(), cancel: jest.fn() } as unknown as AccountInvokeClient;
  const assets = { getInWorkspaceOrThrow: jest.fn() } as unknown as AssetService;
  const library = { getInWorkspaceOrThrow: jest.fn() } as unknown as LibraryService;
  const urls = { getObject: jest.fn() } as unknown as PresignedUrlService;
  const terminal = { succeed: jest.fn(), fail: jest.fn() } as unknown as TaskTerminalService;

  let service: TaskExecutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskExecutorService(tasks, invoke, assets, library, urls, terminal);
    (tasks.startClaimed as jest.Mock).mockImplementation(async (value: ClaimedTask) => value);
    (invoke.cancel as jest.Mock).mockResolvedValue(undefined);
  });

  it('uses a stable per-attempt idempotency key', async () => {
    (invoke.invoke as jest.Mock).mockResolvedValue({ status: 'succeeded', assets: [] });
    (terminal.succeed as jest.Mock).mockResolvedValue(true);

    await service.run(claimed());

    expect(invoke.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: `task:${TASK_ID}:attempt:7` }),
      undefined,
    );
  });

  it('cancels a just-created vendor job when local cancellation won the CAS', async () => {
    (invoke.invoke as jest.Mock).mockResolvedValue({
      status: 'running',
      assets: [],
      external_task_id: 'vendor-1',
      channel_id: CHANNEL_ID,
      credential_id: CREDENTIAL_ID,
    });
    (tasks.saveExternalResult as jest.Mock).mockResolvedValue(false);

    await service.run(claimed());

    expect(invoke.cancel).toHaveBeenCalledWith({
      external_task_id: 'vendor-1',
      model_id: 'test:model',
      channel_id: CHANNEL_ID,
      credential_id: CREDENTIAL_ID,
    });
  });

  it('resolves every asset against the task workspace before invoking', async () => {
    const task = claimed();
    task.inputs = {
      references: [{ slot: 'source_image', type: 'image', asset_id: '77777777-7777-4777-8777-777777777777' }],
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

  it('does not treat a legacy ready provider ref as an invokable vendor binding', async () => {
    const task = claimed();
    task.inputs = {
      references: [{
        slot: 'driving_audio',
        type: 'library_ref',
        library_entry_id: '77777777-7777-4777-8777-777777777777',
      }],
    };
    (library.getInWorkspaceOrThrow as jest.Mock).mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Legacy voice',
      kind: 'voice',
      project_id: null,
      material: null,
      provider_refs: [{ provider: 'bailian', external_ref_id: 'voice-1', status: 'ready' }],
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
      references: [{
        slot: 'source_image',
        type: 'library_ref',
        library_entry_id: '77777777-7777-4777-8777-777777777777',
      }],
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
});

function claimed(): ClaimedTask {
  return {
    id: TASK_ID,
    type: 'gen.image',
    model_id: 'test:model',
    status: 'queued',
    workspace_id: '55555555-5555-4555-8555-555555555555',
    owner_id: '66666666-6666-4666-8666-666666666666',
    project_id: null,
    params: {},
    inputs: {},
    retry_count: 0,
    attempt_no: 7,
    lease_token: LEASE,
    lease_expires_at: new Date(Date.now() + 60_000),
  } as ClaimedTask;
}
