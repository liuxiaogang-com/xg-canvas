import {
  type DecryptedCredential,
  type ProviderAdapter,
  type UnifiedResponse,
} from '@xgcanvas/adapters-contract';

import type { ModelRegistryEntry } from '../registry/types';
import type { ResolvedChannel } from './channel-resolver.service';
import type { InvokeRequestDto } from './dto/invoke-request.dto';
import { InvokeAttemptLogService } from './invoke-attempt-log.service';
import { InvokeService } from './invoke.service';

export const MODEL_ID = 'example:text';
export const MODEL_RESOURCE_UID = '11111111-1111-4111-8111-111111111111';
export const MODEL_REVISION_ID = '22222222-2222-4222-8222-222222222222';
export const RATE_REVISION_ID = '33333333-3333-4333-8333-333333333333';
export const PROVIDER_RESOURCE_UID = '44444444-4444-4444-8444-444444444444';
export const CHANNEL_A = '55555555-5555-4555-8555-555555555555';
export const CHANNEL_B = '66666666-6666-4666-8666-666666666666';
export const CREDENTIAL_A = '77777777-7777-4777-8777-777777777777';
export const CREDENTIAL_B = '88888888-8888-4888-8888-888888888888';

export function makeInvokeHarness(channels: ResolvedChannel[]) {
  const invoke = jest.fn();
  const stream = jest.fn();
  const cancel = jest.fn().mockResolvedValue(undefined);
  const adapter = {
    key: 'test-adapter',
    capabilities: ['gen.text'],
    invocationMode: 'sync',
    invoke,
    stream,
    cancel,
  } as ProviderAdapter;
  const entry = modelEntry();
  const snapshot = {};
  const registry = {
    getSnapshot: jest.fn().mockReturnValue(snapshot),
    requireEntry: jest.fn().mockReturnValue(entry),
    resolveEntryTaskPin: jest.fn().mockReturnValue(entry.pin),
  };
  const adapters = { get: jest.fn().mockReturnValue(adapter) };
  const channelResolver = {
    listCandidates: jest.fn().mockResolvedValue(channels),
    select: jest.fn().mockResolvedValue(channels[0]),
  };
  const credentialResolver = {
    listCandidates: jest.fn((channelResourceUid: string) =>
      Promise.resolve([credential(channelResourceUid)]),
    ),
    select: jest.fn((channelResourceUid: string) =>
      Promise.resolve(credential(channelResourceUid).decrypted),
    ),
    markUsed: jest.fn().mockResolvedValue(undefined),
  };
  const downloader = {
    forTask: jest.fn().mockReturnValue({ download: jest.fn() }),
  };
  const requestLog = {
    record: jest.fn().mockResolvedValue(undefined),
    updatePending: jest.fn().mockResolvedValue(true),
    finalizePending: jest.fn().mockResolvedValue(true),
    nextAttemptNo: jest.fn().mockResolvedValue(1),
  };
  const attemptLogs = new InvokeAttemptLogService(requestLog as never);
  return {
    service: new InvokeService(
      registry as never,
      adapters as never,
      channelResolver as never,
      credentialResolver as never,
      downloader as never,
      attemptLogs,
    ),
    invoke,
    stream,
    cancel,
    requestLog,
    registry,
    adapters,
    channelResolver,
    snapshot,
  };
}

export function invokeChannel(resourceUid: string): ResolvedChannel {
  return {
    resource_uid: resourceUid,
    revision_id:
      resourceUid === CHANNEL_A
        ? 'aaaaaaaa-1111-4111-8111-111111111111'
        : 'bbbbbbbb-2222-4222-8222-222222222222',
    slug: `channel-${resourceUid === CHANNEL_A ? 'a' : 'b'}`,
    base_url: 'https://vendor.example/v1',
    request_config: {},
    priority: resourceUid === CHANNEL_A ? 1 : 2,
  };
}

export function invokeRequest(): InvokeRequestDto {
  return {
    task_id: 'task-1',
    task_type: 'gen.text',
    model_id: MODEL_ID,
    workspace_id: '99999999-9999-4999-8999-999999999999',
    params: {},
    inputs: { prompt: 'hello' },
    resolution: { kind: 'current' },
  };
}

export function invokeResponse(
  status: UnifiedResponse['status'],
  extra: Partial<UnifiedResponse> = {},
): UnifiedResponse {
  return { status, assets: [], ...extra };
}

export function invokeLogCall(
  harness: ReturnType<typeof makeInvokeHarness>,
  index: number,
): Record<string, unknown> {
  return harness.requestLog.record.mock.calls[index][0] as Record<string, unknown>;
}

function modelEntry(): ModelRegistryEntry {
  return {
    manifest: {
      id: MODEL_ID,
      display_name: 'Example Text',
      provider_key: 'example',
      provider_model: 'vendor-text',
      adapter_key: 'test-adapter',
      task_types: ['gen.text'],
      capabilities: [],
      invocation_mode: 'sync',
      enabled: true,
      param_schema: {
        version: '1.0',
        groups: [],
        properties: {},
        required: [],
        defaults: {},
      },
    },
    pin: {
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
      rate_card_revision_id: RATE_REVISION_ID,
      catalog_epoch: '3',
    },
    provider_resource_uid: PROVIDER_RESOURCE_UID,
    allowed_channel_resource_uids: [CHANNEL_A, CHANNEL_B],
    validate: jest.fn((params: Record<string, unknown>) => ({
      valid: true,
      errors: [],
      resolved_params: params,
    })),
  } as unknown as ModelRegistryEntry;
}

function credential(channelResourceUid: string): {
  decrypted: DecryptedCredential;
  label: string;
} {
  const isFirst = channelResourceUid === CHANNEL_A;
  return {
    decrypted: {
      id: isFirst ? CREDENTIAL_A : CREDENTIAL_B,
      channel_resource_uid: channelResourceUid,
      type: 'api_key',
      payload: { api_key: 'test-only' },
    },
    label: isFirst ? 'credential-a' : 'credential-b',
  };
}
