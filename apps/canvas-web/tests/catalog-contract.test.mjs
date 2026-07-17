import assert from 'node:assert/strict';
import test from 'node:test';

import {
  modelIdentityDependency,
  modelSchemaCacheKey,
} from '../src/api/model-identity.ts';
import { formatEstimatedCost } from '../src/canvas/node-inline-form/cost-format.ts';
import { displayModelVersion } from '../src/generation/input-contract-ui.ts';
import { selectCatalogModelParams } from '../src/generation/model-params.ts';
import {
  moveResourceUid,
  toggleResourceUid,
} from '../src/settings/feature-model-order.ts';
import {
  incompatibleFeatureModelUids,
  supportsFeatureTaskType,
} from '../src/settings/feature-model-compatibility.ts';
import {
  buildLocalModelInput,
  compatibleChannelsForAdapter,
  pruneIncompatibleChannelUids,
} from '../src/settings/local-model-create.ts';
import { requireSelectedModel } from '../src/nodes/_shared/model-selection.ts';
import { loadSettingsOverview } from '../src/settings/overview-data.ts';

const identity = {
  model_id: 'provider:public-id',
  model_resource_uid: '11111111-1111-4111-8111-111111111111',
  model_revision_id: '22222222-2222-4222-8222-222222222222',
  catalog_epoch: '7',
};

test('schema cache identity is pinned to resource revision and Catalog epoch', () => {
  assert.equal(
    modelSchemaCacheKey(identity),
    '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:7',
  );
  assert.notEqual(
    modelIdentityDependency(identity),
    modelIdentityDependency({ ...identity, model_revision_id: '33333333-3333-4333-8333-333333333333' }),
  );
  assert.notEqual(
    modelIdentityDependency(identity),
    modelIdentityDependency({ ...identity, catalog_epoch: '8' }),
  );
});

test('Feature Config preserves one explicit resource priority chain', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const third = '33333333-3333-4333-8333-333333333333';
  assert.deepEqual(toggleResourceUid([first, second], third), [first, second, third]);
  assert.deepEqual(toggleResourceUid([first, second], first), [second]);
  assert.deepEqual(moveResourceUid([first, second, third], third, -1), [first, third, second]);
  assert.deepEqual(moveResourceUid([first, second, third], first, -1), [first, second, third]);
});

test('Feature Config only offers models compatible with its authoritative task type', () => {
  const text = {
    resource_uid: '11111111-1111-4111-8111-111111111111',
    task_types: ['gen.text'],
  };
  const image = {
    resource_uid: '22222222-2222-4222-8222-222222222222',
    task_types: ['gen.image'],
  };
  assert.equal(supportsFeatureTaskType(text, 'gen.text'), true);
  assert.equal(supportsFeatureTaskType(image, 'gen.text'), false);
  assert.deepEqual(
    incompatibleFeatureModelUids(
      [text.resource_uid, image.resource_uid, 'missing-model'],
      [text, image],
      'gen.text',
    ),
    [image.resource_uid, 'missing-model'],
  );
});

test('settings overview does not call model-admin endpoints without model permission', async () => {
  let adminCalls = 0;
  const data = await loadSettingsOverview({ canManageModels: false, canViewBilling: true }, {
    stats: async () => ({
      total: 2,
      succeeded: 1,
      failed: 1,
      cancelled: 0,
      running: 0,
      queued: 0,
    }),
    providers: async () => { adminCalls += 1; return []; },
    models: async () => { adminCalls += 1; return []; },
  });

  assert.equal(adminCalls, 0);
  assert.equal(data.providerCount, null);
  assert.equal(data.modelCount, null);
  assert.equal(data.stats?.total, 2);
});

test('settings overview does not call protected Stats without billing permission', async () => {
  let statsCalls = 0;
  const data = await loadSettingsOverview(
    { canManageModels: false, canViewBilling: false },
    {
      stats: async () => {
        statsCalls += 1;
        throw new Error('must not be called');
      },
      providers: async () => [],
      models: async () => [],
    },
  );

  assert.equal(statsCalls, 0);
  assert.equal(data.stats, null);
});

test('settings overview surfaces authorized model-admin failures instead of returning zero', async () => {
  await assert.rejects(
    loadSettingsOverview({ canManageModels: true, canViewBilling: true }, {
      stats: async () => ({
        total: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        running: 0,
        queued: 0,
      }),
      providers: async () => { throw new Error('forbidden'); },
      models: async () => [],
    }),
    /forbidden/,
  );
});

test('generation nodes reject missing selection instead of using a vendor fallback', () => {
  assert.equal(requireSelectedModel('provider:model'), 'provider:model');
  assert.throws(() => requireSelectedModel(null), /请先选择/);
  assert.throws(() => requireSelectedModel('   '), /请先选择/);
});

test('cost estimates preserve real currency and distinguish missing pricing from zero', () => {
  assert.equal(
    formatEstimatedCost({ estimated_cost: 0.125, currency: 'CNY', breakdown: '' }),
    '¥0.125',
  );
  assert.equal(
    formatEstimatedCost({ estimated_cost: 0, currency: 'usd', breakdown: '' }),
    'USD 0',
  );
  assert.equal(
    formatEstimatedCost({ estimated_cost: null, currency: null, breakdown: '暂无定价' }),
    null,
  );
});

test('task params are rebuilt from the current Catalog schema only', () => {
  const specs = [
    { field: 'ratio', label: '比例', control: 'select', options: [{ value: '1:1', label: '1:1' }] },
    { field: 'count', label: '数量', control: 'number', default: 1 },
  ];
  assert.deepEqual(
    selectCatalogModelParams(
      specs,
      { count: 2 },
      { ratio: 'invalid-old-value', description: 'node-only field' },
      { ratio: '1:1', vendor_only_legacy: true },
    ),
    { ratio: '1:1', count: 2 },
  );
});

test('model version labels come from the Catalog option without vendor-specific rewriting', () => {
  const spec = {
    field: 'model_version',
    label: '模型版本',
    control: 'select',
    options: [{ value: '1.0', label: 'Acme Image V1' }],
  };

  assert.equal(displayModelVersion(spec, '1.0'), 'Acme Image V1');
  assert.equal(displayModelVersion(spec, '2.0'), '2.0');
  assert.equal(displayModelVersion(null, 'seedance1.5fast'), 'seedance1.5fast');
  assert.equal(displayModelVersion(spec, null), '选择模型');
});

test('local model channel selection is scoped to one explicit provider and adapter', () => {
  const channels = [
    { resource_uid: 'channel-openai', provider_resource_uid: 'provider-a', adapter_keys: ['openai-compat'] },
    { resource_uid: 'channel-native', provider_resource_uid: 'provider-a', adapter_keys: ['bailian-dashscope'] },
    { resource_uid: 'channel-other', provider_resource_uid: 'provider-b', adapter_keys: ['openai-compat'] },
  ];

  assert.deepEqual(
    compatibleChannelsForAdapter(channels, 'provider-a', 'openai-compat')
      .map((channel) => channel.resource_uid),
    ['channel-openai'],
  );
  assert.deepEqual(
    pruneIncompatibleChannelUids(
      ['channel-openai', 'channel-native', 'missing', 'channel-openai'],
      channels,
      'provider-a',
      'openai-compat',
    ),
    ['channel-openai'],
  );
});

test('local model builder emits the strict safe OpenAI-compatible text contract', () => {
  const provider = {
    resource_uid: 'provider-a',
    adapter_keys: ['openai-compat'],
  };
  const channels = [
    { resource_uid: 'channel-openai', provider_resource_uid: 'provider-a', adapter_keys: ['openai-compat'] },
  ];
  const result = buildLocalModelInput({
    provider_resource_uid: 'provider-a',
    adapter_key: 'openai-compat',
    allowed_channel_resource_uids: ['channel-openai'],
    model_id: '  custom:chat  ',
    provider_model_id: '  vendor-chat  ',
    display_name: '  Vendor Chat  ',
    task_type: 'gen.text',
    invocation_mode: 'stream',
    supports_streaming: false,
  }, provider, channels);

  assert.equal(result.ok, true);
  assert.deepEqual(result.input, {
    provider_resource_uid: 'provider-a',
    model_id: 'custom:chat',
    provider_model_id: 'vendor-chat',
    display_name: 'Vendor Chat',
    task_types: ['gen.text'],
    capabilities: ['text_chat', 'streaming'],
    invocation_mode: 'stream',
    supports_streaming: true,
    adapter_key: 'openai-compat',
    allowed_channel_resource_uids: ['channel-openai'],
    param_schema: {
      version: '1.0',
      groups: [],
      properties: {},
      required: [],
      defaults: {},
    },
    param_constraints: [],
  });
});

test('local model builder refuses to invent templates for native adapters', () => {
  const result = buildLocalModelInput({
    provider_resource_uid: 'provider-a',
    adapter_key: 'bailian-dashscope',
    allowed_channel_resource_uids: ['channel-native'],
    model_id: 'custom:image',
    provider_model_id: 'vendor-image',
    display_name: 'Vendor Image',
    task_type: 'gen.image',
    invocation_mode: 'sync',
    supports_streaming: false,
  }, {
    resource_uid: 'provider-a',
    adapter_keys: ['bailian-dashscope'],
  }, [
    { resource_uid: 'channel-native', provider_resource_uid: 'provider-a', adapter_keys: ['bailian-dashscope'] },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.reason, /Fork/);
});

test('local model builder rejects async behavior that is not part of the safe template', () => {
  const result = buildLocalModelInput({
    provider_resource_uid: 'provider-a',
    adapter_key: 'openai-compat',
    allowed_channel_resource_uids: ['channel-openai'],
    model_id: 'custom:async-chat',
    provider_model_id: 'async-chat',
    display_name: 'Async Chat',
    task_type: 'gen.text',
    invocation_mode: 'async',
    supports_streaming: false,
  }, {
    resource_uid: 'provider-a',
    adapter_keys: ['openai-compat'],
  }, [
    { resource_uid: 'channel-openai', provider_resource_uid: 'provider-a', adapter_keys: ['openai-compat'] },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.reason, /Fork/);
});
