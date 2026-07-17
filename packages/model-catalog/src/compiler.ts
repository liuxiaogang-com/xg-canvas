import { isCapability, isTaskType, type Capability, type TaskType } from '@xgcanvas/shared-types';
import { canonicalJson, compareCodeUnits, sha256Hex } from './canonical';
import { parseOptionalModelInputContract } from './input-contract-schema';
import { assertValidParamContract } from './param-contract-schema';
import { resolveParamSchema } from './param-schema';
import { isCatalogCurrentLifecycle } from './types';
import type {
  CatalogBundleV1,
  CatalogChannelTemplate,
  CatalogCompilation,
  CatalogCompilerInput,
  CatalogCompilerOptions,
  CatalogModelOffering,
  CatalogProvider,
  CatalogRateCard,
  CatalogResourceBase,
  ModelAuthoring,
  ProviderAuthoring,
  ProviderAuthoringDocument,
  RateCardAuthoring,
} from './types';
import { assertValidCatalogBundle } from './validator';
import { assertCatalogRuntimeCompatibility } from './runtime-version';

interface ProviderGroup {
  provider?: ProviderAuthoring;
  providerFile?: string;
  channels: ProviderAuthoringDocument['channels'];
  models: ModelAuthoring[];
  rateCards: RateCardAuthoring[];
}

export function compileCatalog(
  input: CatalogCompilerInput,
  options: CatalogCompilerOptions = {},
): CatalogCompilation {
  const groups = groupDocuments(input.documents);
  const providers: CatalogProvider[] = [];
  const channelTemplates: CatalogChannelTemplate[] = [];
  const modelOfferings: CatalogModelOffering[] = [];
  const rateCards: CatalogRateCard[] = [];

  for (const [providerSlug, group] of sortedEntries(groups)) {
    if (!group.provider) throw new Error(`provider "${providerSlug}" has no provider definition`);
    const provider = compileProvider(group.provider);
    providers.push(provider);

    const channelUidBySlug = new Map<string, string>();
    for (const channel of group.channels ?? []) {
      if (channelUidBySlug.has(channel.slug)) {
        throw new Error(`provider "${providerSlug}" has duplicate channel slug "${channel.slug}"`);
      }
      channelUidBySlug.set(channel.slug, channel.resource_uid);
      channelTemplates.push({
        ...resourceBase(channel),
        kind: 'channel_template',
        provider_uid: provider.resource_uid,
        display_name: channel.display_name,
        invocation_method: channel.invocation_method,
        adapter_keys: sortedUnique(channel.adapter_keys),
        base_url: channel.base_url,
        request_config: channel.request_config ?? {},
      });
    }

    const modelById = new Map<string, ModelAuthoring>();
    for (const model of group.models) {
      if (modelById.has(model.model_id)) {
        throw new Error(`provider "${providerSlug}" has duplicate model_id "${model.model_id}"`);
      }
      modelById.set(model.model_id, model);
    }

    const authoredRates = collectRateCards(group.models, group.rateCards);
    const rateByModelId = new Map<string, RateCardAuthoring>();
    for (const rate of authoredRates) {
      if (!isCatalogCurrentLifecycle(rate.lifecycle ?? 'active')) continue;
      if (rateByModelId.has(rate.model_id)) {
        throw new Error(`model "${rate.model_id}" has more than one active rate card`);
      }
      rateByModelId.set(rate.model_id, rate);
    }

    for (const model of group.models) {
      const rate = rateByModelId.get(model.model_id);
      const compiledModel = compileModel(
        model,
        provider,
        channelUidBySlug,
        input.templates,
        rate?.resource_uid,
      );
      modelOfferings.push(compiledModel);
    }

    for (const rate of authoredRates) {
      const model = modelById.get(rate.model_id);
      if (!model) {
        throw new Error(`rate card "${rate.slug}" references unknown model "${rate.model_id}"`);
      }
      rateCards.push(compileRateCard(rate, model.resource_uid));
    }
  }

  const candidate: CatalogBundleV1 = {
    format: 'xgcanvas.catalog.bundle',
    schema_version: '1',
    source: input.release.source,
    release: input.release.release,
    providers: sortByUid(providers),
    channel_templates: sortByUid(channelTemplates),
    model_offerings: sortByUid(modelOfferings),
    rate_cards: sortByUid(rateCards),
  };

  const bundle = assertValidCatalogBundle(
    candidate,
    options.known_adapter_keys,
    options.adapter_task_types,
  );
  assertCatalogRuntimeCompatibility(bundle);
  const serialized = canonicalJson(bundle);
  return { bundle, canonical_json: serialized, content_digest: sha256Hex(serialized) };
}

function groupDocuments(documents: readonly ProviderAuthoringDocument[]): Map<string, ProviderGroup> {
  const groups = new Map<string, ProviderGroup>();
  const ordered = [...documents].sort((a, b) =>
    compareCodeUnits(normalizePath(a.file_path), normalizePath(b.file_path)),
  );
  for (const document of ordered) {
    const slug = document.provider?.slug ?? document.provider_slug;
    if (!slug) throw new Error(`${document.file_path}: provider or provider_slug is required`);
    const group = groups.get(slug) ?? { channels: [], models: [], rateCards: [] };
    if (document.provider) {
      if (group.provider) {
        throw new Error(`provider "${slug}" is defined by both ${group.providerFile} and ${document.file_path}`);
      }
      group.provider = document.provider;
      group.providerFile = document.file_path;
    }
    group.channels = [...(group.channels ?? []), ...(document.channels ?? [])];
    group.models.push(...(document.models ?? []));
    group.rateCards.push(...(document.rate_cards ?? []));
    groups.set(slug, group);
  }
  return groups;
}

function compileProvider(provider: ProviderAuthoring): CatalogProvider {
  return {
    ...resourceBase(provider),
    kind: 'provider',
    display_name: provider.display_name,
    icon_url: provider.icon_url,
    homepage_url: provider.homepage_url,
    documentation_url: provider.documentation_url,
    description: provider.description,
    auth_method: provider.auth_method ?? 'api_key',
    auth_config: provider.auth_config,
    base_url: provider.base_url,
    invocation_methods: sortedUnique(provider.invocation_methods ?? ['http']),
    adapter_keys: sortedUnique(provider.adapter_keys),
    sdk_package: provider.sdk_package,
    supported_regions: sortedUnique(provider.supported_regions ?? []),
  };
}

function compileModel(
  model: ModelAuthoring,
  provider: CatalogProvider,
  channelUidBySlug: ReadonlyMap<string, string>,
  templates: ReadonlyMap<string, unknown>,
  rateCardUid?: string,
): CatalogModelOffering {
  const taskTypes = model.task_types;
  const capabilities = model.capabilities ?? [];
  assertVocabulary(model.model_id, taskTypes, capabilities);
  const adapterKey = model.adapter_key;
  const allowedChannelUids = model.allowed_channel_slugs.map((slug) => {
    const uid = channelUidBySlug.get(slug);
    if (!uid) throw new Error(`model "${model.model_id}" references unknown channel "${slug}"`);
    return uid;
  });
  const inputContract = parseOptionalModelInputContract(model.input_contract);
  if (!inputContract.success) {
    throw new Error(`model "${model.model_id}" has invalid input_contract: ${inputContract.message}`);
  }

  const paramContract = assertValidParamContract(
    resolveParamSchema(model.param_schema, templates),
    model.param_constraints ?? [],
  );

  return {
    ...resourceBase({
      ...model,
      lifecycle: model.lifecycle ?? 'active',
      slug: model.model_id,
    }),
    kind: 'model_offering',
    provider_uid: provider.resource_uid,
    model_id: model.model_id,
    provider_model_id: model.provider_model_id,
    display_name: model.display_name,
    description: model.description,
    icon_url: model.icon_url,
    task_types: sortedUnique(taskTypes) as TaskType[],
    capabilities: sortedUnique(capabilities) as Capability[],
    invocation_mode: model.invocation_mode ?? 'sync',
    adapter_key: adapterKey,
    supports_streaming:
      model.supports_streaming ??
      ((model.invocation_mode ?? 'sync') === 'stream' || capabilities.includes('streaming')),
    allowed_channel_uids: sortedUnique(allowedChannelUids),
    tags: sortedUnique(model.tags ?? []),
    param_schema: paramContract.schema,
    param_constraints: paramContract.constraints,
    input_contract: inputContract.data,
    poll_policy: model.poll_policy,
    limits: model.limits ?? {},
    rate_card_uid: rateCardUid,
    deprecated_message: model.deprecated_message,
  };
}

function collectRateCards(
  models: readonly ModelAuthoring[],
  separate: readonly RateCardAuthoring[],
): RateCardAuthoring[] {
  const inline = models.flatMap((model): RateCardAuthoring[] => {
    if (!model.pricing) return [];
    const {
      resource_uid,
      revision,
      lifecycle,
      slug,
      effective_from,
      currency,
      components,
    } = model.pricing;
    return [{
      resource_uid,
      revision,
      lifecycle,
      slug: slug ?? `${model.model_id}:default`,
      model_id: model.model_id,
      effective_from,
      pricing: { currency, components },
    }];
  });
  return [...separate, ...inline];
}

function compileRateCard(rate: RateCardAuthoring, modelUid: string): CatalogRateCard {
  return {
    ...resourceBase(rate),
    kind: 'rate_card',
    model_uid: modelUid,
    effective_from: rate.effective_from,
    pricing: rate.pricing,
  };
}

function resourceBase(resource: {
  resource_uid: string;
  revision: number;
  slug: string;
  lifecycle?: CatalogResourceBase['lifecycle'];
}): CatalogResourceBase {
  return {
    resource_uid: resource.resource_uid,
    revision: resource.revision,
    slug: resource.slug,
    lifecycle: resource.lifecycle ?? 'active',
  };
}

function assertVocabulary(modelId: string, taskTypes: string[], capabilities: string[]): void {
  for (const taskType of taskTypes) {
    if (!isTaskType(taskType)) throw new Error(`model "${modelId}" has unknown task_type "${taskType}"`);
  }
  for (const capability of capabilities) {
    if (!isCapability(capability)) {
      throw new Error(`model "${modelId}" has unknown capability "${capability}"`);
    }
  }
}

function sortByUid<T extends { resource_uid: string }>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => compareCodeUnits(a.resource_uid, b.resource_uid));
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function sortedEntries<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map.entries()].sort(([a], [b]) => compareCodeUnits(a, b));
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}
