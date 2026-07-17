import { describe, expect, it } from 'vitest';
import { compileCatalog } from './compiler';
import { compareCodeUnits } from './canonical';
import { ProviderAuthoringDocumentSchema } from './schema';
import { assertValidCatalogBundle } from './validator';
import type { CatalogCompilerInput } from './types';

const IDS = {
  source: '00000000-0000-4000-8000-000000000001',
  release: '00000000-0000-4000-8000-000000000002',
  provider: '00000000-0000-4000-8000-000000000003',
  channel: '00000000-0000-4000-8000-000000000004',
  model: '00000000-0000-4000-8000-000000000005',
  rate: '00000000-0000-4000-8000-000000000006',
};

describe('compileCatalog', () => {
  it('uses locale-independent code-unit ordering', () => {
    expect(['中', 'z', 'ä', 'a'].sort(compareCodeUnits)).toEqual(['a', 'z', 'ä', '中']);
  });

  it('rejects unknown provider fields instead of silently ignoring typos', () => {
    const result = ProviderAuthoringDocumentSchema.safeParse({
      provider: {
        resource_uid: IDS.provider,
        revision: 1,
        slug: 'example',
        display_name: 'Example',
        default_invocation_method: 'cli',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unsupported Provider authentication methods', () => {
    const result = ProviderAuthoringDocumentSchema.safeParse({
      provider: {
        resource_uid: IDS.provider,
        revision: 1,
        slug: 'example',
        display_name: 'Example',
        auth_method: 'oauth',
        adapter_keys: ['openai-compat'],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-finite values instead of canonicalizing them to null', () => {
    const input = minimalInput();
    input.documents[1].models![0].limits = { timeout: Number.POSITIVE_INFINITY };
    expect(() => compileCatalog(input)).toThrow('must be a finite JSON number');
  });

  it('compiles split documents into a deterministic normalized bundle', () => {
    const input = minimalInput();
    const first = compileCatalog(input, { known_adapter_keys: new Set(['openai-compat']) });
    const second = compileCatalog(
      { ...input, documents: [...input.documents].reverse() },
      { known_adapter_keys: new Set(['openai-compat']) },
    );

    expect(first.canonical_json).toBe(second.canonical_json);
    expect(first.content_digest).toBe(second.content_digest);
    expect(first.bundle.providers).toHaveLength(1);
    expect(first.bundle.channel_templates).toHaveLength(1);
    expect(first.bundle.model_offerings).toHaveLength(1);
    expect(first.bundle.rate_cards).toHaveLength(1);
    expect(first.bundle.model_offerings[0]).toMatchObject({
      model_id: 'example:chat',
      provider_uid: IDS.provider,
      allowed_channel_uids: [IDS.channel],
      rate_card_uid: IDS.rate,
      task_types: ['gen.text'],
      capabilities: ['streaming', 'text_chat'],
    });
  });

  it('rejects references to an unknown channel', () => {
    const input = minimalInput();
    input.documents[1].models![0].allowed_channel_slugs = ['missing'];
    expect(() => compileCatalog(input)).toThrow('references unknown channel');
  });

  it('requires every model to bind at least one explicit channel', () => {
    const input = minimalInput();
    input.documents[1].models![0].allowed_channel_slugs = [];
    expect(() => compileCatalog(input)).toThrow();
  });

  it('rejects a model/channel adapter mismatch', () => {
    const input = minimalInput();
    input.documents[0].provider!.adapter_keys = ['openai-compat', 'bailian-dashscope'];
    input.documents[0].channels![0].adapter_keys = ['bailian-dashscope'];
    expect(() => compileCatalog(input)).toThrow('does not support adapter "openai-compat"');
  });

  it('rejects channel adapters not declared by the provider', () => {
    const input = minimalInput();
    input.documents[0].channels![0].adapter_keys = ['bailian-dashscope'];
    expect(() => compileCatalog(input)).toThrow('is not declared by provider');
  });

  it('rejects duplicate resource ids across kinds', () => {
    const input = minimalInput();
    input.documents[1].models![0].resource_uid = IDS.channel;
    expect(() => compileCatalog(input)).toThrow('duplicate resource_uid');
  });

  it('rejects an adapter unavailable in the runtime', () => {
    expect(() =>
      compileCatalog(minimalInput(), { known_adapter_keys: new Set(['different']) }),
    ).toThrow('is not available in this runtime');
  });

  it('rejects a current model that its adapter cannot execute', () => {
    expect(() => compileCatalog(minimalInput(), {
      known_adapter_keys: new Set(['openai-compat']),
      adapter_task_types: new Map([['openai-compat', ['gen.image']]]),
    })).toThrow('does not support: gen.text');
  });

  it('rejects legacy task aliases instead of normalizing them', () => {
    const input = minimalInput();
    input.documents[1].models![0].task_types = ['text_generation'];

    expect(() => compileCatalog(input)).toThrow('unknown task_type "text_generation"');
  });

  it('rejects legacy capability aliases instead of normalizing them', () => {
    const input = minimalInput();
    input.documents[1].models![0].capabilities = ['chat'];

    expect(() => compileCatalog(input)).toThrow('unknown capability "chat"');
  });

  it('rejects an unknown parameter template', () => {
    const input = minimalInput();
    input.documents[1].models![0].param_schema = { extends: 'templates/missing' };
    expect(() => compileCatalog(input)).toThrow('unknown param_schema template: missing');
  });

  it('rejects parameter groups and constraints that reference unknown fields', () => {
    const input = minimalInput();
    input.documents[1].models![0].param_schema = {
      version: '1.0',
      groups: [{ id: 'bad', label: 'Bad', fields: ['missing'] }],
      properties: {}, required: [], defaults: {},
    };
    expect(() => compileCatalog(input)).toThrow('references unknown field "missing"');
  });

  it('rejects legacy flat parameter schemas instead of converting them', () => {
    const input = minimalInput();
    input.documents[1].models![0].param_schema = {
      kind: 'text',
      fields: [{ name: 'prompt', type: 'text' }],
    };

    expect(() => compileCatalog(input)).toThrow(
      'param_schema must use the canonical properties/groups structure',
    );
  });

  it('requires a complete strict V1 parameter schema when authored directly', () => {
    const incomplete = minimalInput();
    incomplete.documents[1].models![0].param_schema = { properties: {} };
    expect(() => compileCatalog(incomplete)).toThrow();

    const extra = minimalInput();
    extra.documents[1].models![0].param_schema = {
      version: '1.0', groups: [], properties: {}, required: [], defaults: {}, typo: true,
    };
    expect(() => compileCatalog(extra)).toThrow('Unrecognized key');
  });

  it('rejects unknown parameter-template override keys', () => {
    const input = minimalInput();
    input.documents[1].models![0].param_schema = {
      extends: 'templates/text-generation',
      override: { typo: true },
    };
    expect(() => compileCatalog(input)).toThrow('Unrecognized key');
  });

  it('rejects legacy pricing shapes instead of converting them', () => {
    const input = minimalInput();
    input.documents[1].models![0].pricing = {
      resource_uid: IDS.rate,
      revision: 1,
      unit: 'token',
      currency: 'USD',
      input_price_per_1k: 0.001,
      output_price_per_1k: 0.002,
    } as never;

    expect(() => compileCatalog(input)).toThrow('rate_cards.0.pricing.components');
  });

  it('rejects current resources that depend on terminal resources', () => {
    const providerTerminal = minimalInput();
    providerTerminal.documents[0].provider!.lifecycle = 'retired';
    expect(() => compileCatalog(providerTerminal)).toThrow('references a terminal provider');

    const channelTerminal = minimalInput();
    channelTerminal.documents[0].channels![0].lifecycle = 'revoked';
    expect(() => compileCatalog(channelTerminal)).toThrow('references terminal channel');

    const rateTerminal = structuredClone(compileCatalog(minimalInput()).bundle);
    rateTerminal.rate_cards[0].lifecycle = 'retired';
    expect(() => assertValidCatalogBundle(rateTerminal)).toThrow('references a terminal rate card');
  });

  it('keeps terminal revisions in their canonical resource arrays', () => {
    const input = minimalInput();
    input.documents[0].provider!.lifecycle = 'retired';
    input.documents[0].channels![0].lifecycle = 'retired';
    input.documents[1].models![0].lifecycle = 'retired';
    input.documents[1].models![0].pricing!.lifecycle = 'retired';

    const { bundle } = compileCatalog(input);
    expect(bundle.providers[0].lifecycle).toBe('retired');
    expect(bundle.channel_templates[0].lifecycle).toBe('retired');
    expect(bundle.model_offerings[0].lifecycle).toBe('retired');
    expect(bundle.rate_cards[0].lifecycle).toBe('retired');
    expect(bundle.model_offerings[0].rate_card_uid).toBeUndefined();
    expect(bundle).not.toHaveProperty('tombstones');
  });

  it('rejects an active Rate Card that its owner Model no longer links', () => {
    const bundle = structuredClone(compileCatalog(minimalInput()).bundle);
    delete bundle.model_offerings[0].rate_card_uid;

    expect(() => assertValidCatalogBundle(bundle)).toThrow(
      'current rate card is not linked by its owner model',
    );
  });

  it('rejects aliases in authoring and aliases or tombstones in bundles', () => {
    const authoring = ProviderAuthoringDocumentSchema.safeParse({
      provider_slug: 'example',
      models: [{
        ...minimalInput().documents[1].models![0],
        aliases: ['example:chat-v0'],
      }],
    });
    expect(authoring.success).toBe(false);

    const bundle = compileCatalog(minimalInput()).bundle;
    expect(() => assertValidCatalogBundle({ ...bundle, aliases: [] })).toThrow('Unrecognized key');
    expect(() => assertValidCatalogBundle({ ...bundle, tombstones: [] })).toThrow('Unrecognized key');
  });
});

function minimalInput(): CatalogCompilerInput {
  return {
    release: {
      format: 'xgcanvas.catalog.authoring',
      schema_version: '1',
      source: { source_id: IDS.source, namespace: 'xgcanvas.official', kind: 'official' },
      release: {
        release_id: IDS.release,
        sequence: 1,
        published_at: '2026-07-14T00:00:00Z',
        min_runtime_version: '0.1.0',
      },
    },
    templates: new Map([
      ['text-generation', {
        version: '1.0',
        groups: [],
        properties: { prompt: { type: 'text', label: 'Prompt' } },
        required: ['prompt'],
        defaults: {},
      }],
    ]),
    documents: [
      {
        file_path: 'model-providers/example/provider.yaml',
        provider: {
          resource_uid: IDS.provider,
          revision: 1,
          slug: 'example',
          display_name: 'Example',
          adapter_keys: ['openai-compat'],
        },
        channels: [{
          resource_uid: IDS.channel,
          revision: 1,
          slug: 'example-official',
          display_name: 'Official',
          invocation_method: 'http',
          adapter_keys: ['openai-compat'],
        }],
      },
      {
        file_path: 'model-providers/example/models/text.yaml',
        provider_slug: 'example',
        models: [{
          resource_uid: IDS.model,
          revision: 1,
          model_id: 'example:chat',
          provider_model_id: 'chat',
          display_name: 'Chat',
          task_types: ['gen.text'],
          capabilities: ['text_chat', 'streaming'],
          invocation_mode: 'stream',
          adapter_key: 'openai-compat',
          allowed_channel_slugs: ['example-official'],
          param_schema: { extends: 'templates/text-generation' },
          pricing: {
            resource_uid: IDS.rate,
            revision: 1,
            currency: 'USD',
            components: [{ meter: 'requests', per: 1, price: 0.01 }],
          },
        }],
      },
    ],
  };
}
