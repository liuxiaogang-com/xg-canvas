import {
  AdapterError,
  type DecryptedCredential,
  type ProviderAdapter,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import type { ModelRegistryEntry } from '../registry/types';
import type { ResolvedChannel } from './channel-resolver.service';
import { CancelService } from './cancel.service';
import type { CancelRequestDto } from './dto/cancel-request.dto';

const MODEL_ID = 'example:video';
const MODEL_RESOURCE_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION_ID = '22222222-2222-4222-8222-222222222222';
const RATE_REVISION_ID = '33333333-3333-4333-8333-333333333333';
const PROVIDER_RESOURCE_UID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_RESOURCE_UID = '55555555-5555-4555-8555-555555555555';
const CHANNEL_REVISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHANNEL_ROUTE = {
  key: 'historical-channel',
  base_url: 'https://historical.example/v1',
  options: { historical: true },
};
const CREDENTIAL_ID = '66666666-6666-4666-8666-666666666666';
const OWNER_ID = '77777777-7777-4777-8777-777777777777';
const WORKSPACE_ID = '88888888-8888-4888-8888-888888888888';
const PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const TASK_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXTERNAL_TASK_ID = 'vendor-task-1';

describe('CancelService historical routing and request logging', () => {
  it('logs before cancelling the exact historical route and keeps the row non-billable', async () => {
    const harness = makeHarness();
    harness.cancel.mockResolvedValue(undefined);

    await expect(harness.service.cancel(request())).resolves.toBeUndefined();

    expect(harness.registry.requirePinnedEntry).toHaveBeenCalledWith(request(), harness.snapshot);
    expect(harness.adapters.get).toHaveBeenCalledWith('test-adapter');
    expect(harness.channels.getHistoricalRoute).toHaveBeenCalledWith(
      {
        model_id: MODEL_ID,
        model_resource_uid: MODEL_RESOURCE_UID,
        model_revision_id: MODEL_REVISION_ID,
        provider_resource_uid: PROVIDER_RESOURCE_UID,
        adapter_key: 'test-adapter',
        allowed_channel_resource_uids: [CHANNEL_RESOURCE_UID],
        historical: true,
      },
      CHANNEL_RESOURCE_UID,
      CHANNEL_REVISION_ID,
      CHANNEL_ROUTE,
      harness.snapshot,
    );
    expect(harness.credentials.selectHistorical).toHaveBeenCalledWith(
      CHANNEL_RESOURCE_UID,
      CREDENTIAL_ID,
    );
    expect(harness.channels.select).not.toHaveBeenCalled();
    expect(harness.credentials.select).not.toHaveBeenCalled();

    const log = recordedLog(harness);
    expect(log).toMatchObject({
      id: expect.any(String),
      logical_request_id: expect.any(String),
      attempt_no: 1,
      source: 'cancel',
      operation: 'cancel',
      owner_id: OWNER_ID,
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      task_id: TASK_ID,
      provider_slug: 'example',
      model_id: MODEL_ID,
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
      rate_card_revision_id: null,
      catalog_epoch: '7',
      adapter_key: 'test-adapter',
      channel_resource_uid: CHANNEL_RESOURCE_UID,
      credential_id: CREDENTIAL_ID,
      status: 'pending',
      request_summary: { external_task_id: EXTERNAL_TASK_ID },
    });
    expect(log.logical_request_id).toBe(log.id);
    expect(harness.cancel).toHaveBeenCalledWith(
      EXTERNAL_TASK_ID,
      expect.objectContaining({
        task_id: TASK_ID,
        workspace_id: WORKSPACE_ID,
        project_id: PROJECT_ID,
        channel: expect.objectContaining({ resource_uid: CHANNEL_RESOURCE_UID }),
        credential: expect.objectContaining({ id: CREDENTIAL_ID }),
      }),
    );
    expect(harness.requestLogs.finalizePending).toHaveBeenCalledWith(log.id, {
      status: 'success',
      latency_ms: expect.any(Number),
    });
    expect(harness.requestLogs.record.mock.invocationCallOrder[0]).toBeLessThan(
      harness.cancel.mock.invocationCallOrder[0],
    );
    expect(harness.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      harness.requestLogs.finalizePending.mock.invocationCallOrder[0],
    );
    expect(harness.registry.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('finalizes an adapter exception against the pending cancel row before rethrowing', async () => {
    const harness = makeHarness();
    const error = new AdapterError({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      message: 'vendor cancel unavailable',
      retryable: true,
      httpStatus: 502,
      vendor: { request: 'vendor-request-1' },
    });
    harness.cancel.mockRejectedValue(error);

    await expect(harness.service.cancel(request())).rejects.toBe(error);

    const log = recordedLog(harness);
    expect(log).toMatchObject({
      rate_card_revision_id: null,
      model_revision_id: MODEL_REVISION_ID,
      status: 'pending',
    });
    expect(harness.requestLogs.finalizePending).toHaveBeenCalledWith(log.id, {
      status: 'error',
      latency_ms: expect.any(Number),
      http_status: 502,
      error_code: ERROR_CODES.VENDOR_UNAVAILABLE,
      error_message: 'vendor cancel unavailable',
      vendor_error: { request: 'vendor-request-1' },
    });
    expect(harness.requestLogs.record.mock.invocationCallOrder[0]).toBeLessThan(
      harness.cancel.mock.invocationCallOrder[0],
    );
    expect(harness.registry.getSnapshot).toHaveBeenCalledTimes(1);
  });
});

function makeHarness() {
  const cancel = jest.fn();
  const adapter = {
    key: 'test-adapter',
    capabilities: ['gen.video'],
    invocationMode: 'async',
    invoke: jest.fn(),
    cancel,
  } as ProviderAdapter;
  const entry = modelEntry();
  const snapshot = {};
  const registry = {
    getSnapshot: jest.fn().mockReturnValue(snapshot),
    requirePinnedEntry: jest.fn().mockReturnValue(entry),
  };
  const adapters = { get: jest.fn().mockReturnValue(adapter) };
  const channels = {
    getHistoricalRoute: jest.fn().mockResolvedValue(channel()),
    select: jest.fn(),
  };
  const credentials = {
    selectHistorical: jest.fn().mockResolvedValue(credential()),
    select: jest.fn(),
  };
  const downloader = {
    forTask: jest.fn().mockReturnValue({ download: jest.fn() }),
  };
  const requestLogs = {
    record: jest.fn().mockResolvedValue(undefined),
    finalizePending: jest.fn().mockResolvedValue(true),
  };
  return {
    service: new CancelService(
      registry as never,
      adapters as never,
      channels as never,
      credentials as never,
      downloader as never,
      requestLogs as never,
    ),
    cancel,
    registry,
    channels,
    credentials,
    requestLogs,
    adapters,
    snapshot,
  };
}

function modelEntry(): ModelRegistryEntry {
  return {
    manifest: {
      id: MODEL_ID,
      provider_key: 'example',
      adapter_key: 'test-adapter',
    },
    pin: {
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
      rate_card_revision_id: RATE_REVISION_ID,
      catalog_epoch: '7',
    },
    provider_resource_uid: PROVIDER_RESOURCE_UID,
    allowed_channel_resource_uids: [CHANNEL_RESOURCE_UID],
  } as unknown as ModelRegistryEntry;
}

function channel(): ResolvedChannel {
  return {
    resource_uid: CHANNEL_RESOURCE_UID,
    revision_id: CHANNEL_REVISION_ID,
    slug: 'disabled-archived-route',
    base_url: 'https://vendor.example/v1',
    request_config: { historical: true },
    priority: 1,
  };
}

function credential(): DecryptedCredential {
  return {
    id: CREDENTIAL_ID,
    channel_resource_uid: CHANNEL_RESOURCE_UID,
    type: 'api_key',
    payload: { api_key: 'test-only' },
  };
}

function request(): CancelRequestDto {
  return {
    task_id: TASK_ID,
    external_task_id: EXTERNAL_TASK_ID,
    model_id: MODEL_ID,
    workspace_id: WORKSPACE_ID,
    owner_id: OWNER_ID,
    project_id: PROJECT_ID,
    channel_resource_uid: CHANNEL_RESOURCE_UID,
    channel_revision_id: CHANNEL_REVISION_ID,
    channel_route: CHANNEL_ROUTE,
    credential_id: CREDENTIAL_ID,
    model_resource_uid: MODEL_RESOURCE_UID,
    model_revision_id: MODEL_REVISION_ID,
    rate_card_revision_id: RATE_REVISION_ID,
    catalog_epoch: '7',
  };
}

function recordedLog(harness: ReturnType<typeof makeHarness>): Record<string, unknown> {
  return harness.requestLogs.record.mock.calls[0][0] as Record<string, unknown>;
}
