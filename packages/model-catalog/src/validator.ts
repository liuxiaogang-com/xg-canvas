import { CatalogBundleV1Schema } from './schema';
import { assertValidParamContract } from './param-contract-schema';
import { isCatalogCurrentLifecycle, type CatalogBundleV1, type CatalogResourceKind } from './types';

export interface CatalogValidationIssue {
  path: string;
  message: string;
}

export type CatalogValidationResult =
  | { ok: true; bundle: CatalogBundleV1 }
  | { ok: false; issues: CatalogValidationIssue[] };

export function validateCatalogBundle(
  raw: unknown,
  knownAdapterKeys?: ReadonlySet<string>,
  adapterTaskTypes?: ReadonlyMap<string, readonly string[]>,
): CatalogValidationResult {
  const parsed = CatalogBundleV1Schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.errors.map((error) => ({
        path: error.path.join('.'),
        message: error.message,
      })),
    };
  }

  const bundle = parsed.data;
  const issues: CatalogValidationIssue[] = [];
  const resources = [
    ...bundle.providers,
    ...bundle.channel_templates,
    ...bundle.model_offerings,
    ...bundle.rate_cards,
  ];
  reportDuplicate(
    resources,
    (resource) => resource.resource_uid,
    'resources',
    'resource_uid',
    issues,
  );
  reportDuplicateByKind(resources, issues);
  reportDuplicate(
    bundle.model_offerings,
    (model) => model.model_id,
    'model_offerings',
    'model_id',
    issues,
  );

  const providerByUid = new Map(
    bundle.providers.map((provider) => [provider.resource_uid, provider]),
  );
  const channelByUid = new Map(
    bundle.channel_templates.map((channel) => [channel.resource_uid, channel]),
  );
  const modelByUid = new Map(bundle.model_offerings.map((model) => [model.resource_uid, model]));
  const rateCardByUid = new Map(bundle.rate_cards.map((rate) => [rate.resource_uid, rate]));

  bundle.channel_templates.forEach((channel, index) => {
    const provider = providerByUid.get(channel.provider_uid);
    if (!provider) {
      issue(issues, `channel_templates.${index}.provider_uid`, 'references an unknown provider');
    } else if (
      isCatalogCurrentLifecycle(channel.lifecycle) &&
      !isCatalogCurrentLifecycle(provider.lifecycle)
    ) {
      issue(issues, `channel_templates.${index}.provider_uid`, 'references a terminal provider');
    } else {
      for (const adapterKey of channel.adapter_keys) {
        if (!provider.adapter_keys.includes(adapterKey)) {
          issue(
            issues,
            `channel_templates.${index}.adapter_keys`,
            `adapter "${adapterKey}" is not declared by provider "${provider.slug}"`,
          );
        }
      }
    }
  });

  bundle.model_offerings.forEach((model, index) => {
    try {
      assertValidParamContract(model.param_schema, model.param_constraints);
    } catch (error) {
      issue(
        issues,
        `model_offerings.${index}.param_schema`,
        error instanceof Error ? error.message : String(error),
      );
    }
    const provider = providerByUid.get(model.provider_uid);
    if (!provider) {
      issue(issues, `model_offerings.${index}.provider_uid`, 'references an unknown provider');
    } else if (
      isCatalogCurrentLifecycle(model.lifecycle) &&
      !isCatalogCurrentLifecycle(provider.lifecycle)
    ) {
      issue(issues, `model_offerings.${index}.provider_uid`, 'references a terminal provider');
    } else if (!provider.adapter_keys.includes(model.adapter_key)) {
      issue(
        issues,
        `model_offerings.${index}.adapter_key`,
        `adapter "${model.adapter_key}" is not declared by provider "${provider.slug}"`,
      );
    }
    if (
      isCatalogCurrentLifecycle(model.lifecycle) &&
      knownAdapterKeys &&
      !knownAdapterKeys.has(model.adapter_key)
    ) {
      issue(
        issues,
        `model_offerings.${index}.adapter_key`,
        `adapter "${model.adapter_key}" is not available in this runtime`,
      );
    }
    const supportedTaskTypes = adapterTaskTypes?.get(model.adapter_key);
    if (isCatalogCurrentLifecycle(model.lifecycle) && supportedTaskTypes) {
      const unsupported = model.task_types.filter(
        (taskType) => !supportedTaskTypes.includes(taskType),
      );
      if (unsupported.length > 0) {
        issue(
          issues,
          `model_offerings.${index}.task_types`,
          `adapter "${model.adapter_key}" does not support: ${unsupported.join(', ')}`,
        );
      }
    }
    for (const channelUid of model.allowed_channel_uids) {
      const channel = channelByUid.get(channelUid);
      if (!channel) {
        issue(
          issues,
          `model_offerings.${index}.allowed_channel_uids`,
          `references unknown channel "${channelUid}"`,
        );
      } else if (channel.provider_uid !== model.provider_uid) {
        issue(
          issues,
          `model_offerings.${index}.allowed_channel_uids`,
          `channel "${channel.slug}" belongs to another provider`,
        );
      } else if (
        isCatalogCurrentLifecycle(model.lifecycle) &&
        !isCatalogCurrentLifecycle(channel.lifecycle)
      ) {
        issue(
          issues,
          `model_offerings.${index}.allowed_channel_uids`,
          `references terminal channel "${channel.slug}"`,
        );
      } else if (!channel.adapter_keys.includes(model.adapter_key)) {
        issue(
          issues,
          `model_offerings.${index}.allowed_channel_uids`,
          `channel "${channel.slug}" does not support adapter "${model.adapter_key}"`,
        );
      }
    }
    if (model.rate_card_uid) {
      const rate = rateCardByUid.get(model.rate_card_uid);
      if (!rate) {
        issue(issues, `model_offerings.${index}.rate_card_uid`, 'references an unknown rate card');
      } else if (rate.model_uid !== model.resource_uid) {
        issue(
          issues,
          `model_offerings.${index}.rate_card_uid`,
          'rate card belongs to another model',
        );
      } else if (
        isCatalogCurrentLifecycle(model.lifecycle) &&
        !isCatalogCurrentLifecycle(rate.lifecycle)
      ) {
        issue(issues, `model_offerings.${index}.rate_card_uid`, 'references a terminal rate card');
      }
    }
  });

  bundle.rate_cards.forEach((rate, index) => {
    const model = modelByUid.get(rate.model_uid);
    if (!model) {
      issue(issues, `rate_cards.${index}.model_uid`, 'references an unknown model');
    } else if (
      isCatalogCurrentLifecycle(rate.lifecycle) &&
      !isCatalogCurrentLifecycle(model.lifecycle)
    ) {
      issue(
        issues,
        `rate_cards.${index}.model_uid`,
        'current rate card belongs to a terminal model',
      );
    } else if (
      isCatalogCurrentLifecycle(rate.lifecycle) &&
      model.rate_card_uid !== rate.resource_uid
    ) {
      issue(
        issues,
        `rate_cards.${index}.model_uid`,
        'current rate card is not linked by its owner model',
      );
    }
  });

  return issues.length ? { ok: false, issues } : { ok: true, bundle };
}

export function assertValidCatalogBundle(
  raw: unknown,
  knownAdapterKeys?: ReadonlySet<string>,
  adapterTaskTypes?: ReadonlyMap<string, readonly string[]>,
): CatalogBundleV1 {
  const result = validateCatalogBundle(raw, knownAdapterKeys, adapterTaskTypes);
  if (result.ok) return result.bundle;
  throw new Error(
    `catalog validation failed:\n${result.issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n')}`,
  );
}

function reportDuplicate<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  path: string,
  label: string,
  issues: CatalogValidationIssue[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = keyOf(value);
    if (seen.has(key)) issue(issues, `${path}.${index}`, `duplicate ${label} "${key}"`);
    seen.add(key);
  });
}

function reportDuplicateByKind(
  resources: readonly { kind: CatalogResourceKind; slug: string }[],
  issues: CatalogValidationIssue[],
): void {
  reportDuplicate(
    resources,
    (resource) => `${resource.kind}:${resource.slug}`,
    'resources',
    'kind/slug',
    issues,
  );
}

function issue(issues: CatalogValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}
