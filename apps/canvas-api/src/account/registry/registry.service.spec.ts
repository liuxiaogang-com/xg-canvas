import type { CatalogModelOffering } from '@xgcanvas/model-catalog';
import { RegistryService } from './registry.service';
import type { ModelRegistryEntry, RegistrySnapshot } from './types';

const MODEL_UID = '11111111-1111-4111-8111-111111111111';
const MODEL_REVISION = '22222222-2222-4222-8222-222222222222';
const RATE_UID = '33333333-3333-4333-8333-333333333333';
const RATE_REVISION = '44444444-4444-4444-8444-444444444444';
const PROVIDER_UID = '55555555-5555-4555-8555-555555555555';

describe('RegistryService immutable model pins', () => {
  let service: RegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistryService();
  });

  it('does not resolve an undeclared legacy model alias', () => {
    const entry = makeEntry();
    service.setSnapshot(snapshot(entry));

    expect(service.getEntry('old:model')).toBeNull();
    expect(() => service.resolveTaskPin('old:model', 'gen.text')).toThrow('model not registered');
  });

  it('fails closed when the pinned rate revision belongs to another model', () => {
    const entry = makeEntry();
    const value = snapshot(entry);
    value.rateCardsByRevisionId = new Map([
      [
        RATE_REVISION,
        {
          resource_uid: RATE_UID,
          model_resource_uid: '66666666-6666-4666-8666-666666666666',
          revision: 1,
          revision_id: RATE_REVISION,
          pricing: {},
        },
      ],
    ]);
    service.setSnapshot(value);

    expect(() => service.requirePinnedEntry(entry.pin)).toThrow(
      'rate-card revision does not belong to model revision',
    );
  });

  it('does not issue a new task pin for a disabled model', () => {
    const entry = makeEntry(false);
    service.setSnapshot(snapshot(entry));

    expect(() => service.resolveTaskPin('example:model', 'gen.text')).toThrow('model disabled');
  });
});

function makeEntry(enabled = true): ModelRegistryEntry {
  const document: CatalogModelOffering = {
    kind: 'model_offering',
    resource_uid: MODEL_UID,
    revision: 1,
    lifecycle: 'active',
    slug: 'example:model',
    provider_uid: PROVIDER_UID,
    model_id: 'example:model',
    provider_model_id: 'upstream',
    display_name: 'Example',
    task_types: ['gen.text'],
    capabilities: [],
    invocation_mode: 'sync',
    adapter_key: 'test-adapter',
    supports_streaming: false,
    allowed_channel_uids: [],
    tags: [],
    param_schema: { version: '1.0', groups: [], properties: {}, required: [], defaults: {} },
    param_constraints: [],
    limits: {},
    rate_card_uid: RATE_UID,
  };
  return {
    manifest: {
      id: document.model_id,
      display_name: document.display_name,
      provider_key: 'example',
      provider_model: document.provider_model_id,
      adapter_key: document.adapter_key,
      task_types: document.task_types,
      capabilities: document.capabilities,
      invocation_mode: document.invocation_mode,
      enabled,
      param_schema: document.param_schema,
    },
    document,
    origin: {
      kind: 'official',
      source_id: '77777777-7777-4777-8777-777777777777',
      resource_uid: MODEL_UID,
      revision: 1,
      revision_id: MODEL_REVISION,
      release_id: '88888888-8888-4888-8888-888888888888',
    },
    pin: {
      model_resource_uid: MODEL_UID,
      model_revision_id: MODEL_REVISION,
      rate_card_revision_id: RATE_REVISION,
      catalog_epoch: '3',
    },
    provider_resource_uid: PROVIDER_UID,
    rate_card_resource_uid: RATE_UID,
    allowed_channel_resource_uids: [],
    validate: jest.fn(() => ({ valid: true, errors: [], resolved_params: {} })),
  } as ModelRegistryEntry;
}

function snapshot(entry: ModelRegistryEntry): RegistrySnapshot {
  return {
    byId: new Map([[entry.manifest.id, entry]]),
    byRevisionId: new Map([[MODEL_REVISION, entry]]),
    providersByResourceUid: new Map(),
    channelsByResourceUid: new Map(),
    rateCardsByRevisionId: new Map([
      [
        RATE_REVISION,
        {
          resource_uid: RATE_UID,
          model_resource_uid: MODEL_UID,
          revision: 1,
          revision_id: RATE_REVISION,
          pricing: {},
        },
      ],
    ]),
    byTaskType: new Map([['gen.text', [entry]]]),
    byProvider: new Map([['example', [entry]]]),
    loaded_at: new Date().toISOString(),
    catalog_epoch: '3',
    content_digest: 'digest',
  };
}
