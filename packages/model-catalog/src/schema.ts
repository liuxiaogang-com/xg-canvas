import { z } from 'zod';
import {
  CAPABILITIES,
  MAX_CATALOG_ADAPTER_KEY_LENGTH,
  MAX_CATALOG_DISPLAY_NAME_LENGTH,
  MAX_CATALOG_INVOCATION_METHOD_LENGTH,
  MAX_CATALOG_NAMESPACE_LENGTH,
  MAX_CATALOG_RESOURCE_SLUG_LENGTH,
  MAX_CATALOG_SDK_PACKAGE_LENGTH,
  MAX_CHANNEL_SLUG_LENGTH,
  MAX_MODEL_ID_LENGTH,
  MAX_PROVIDER_SLUG_LENGTH,
  PROVIDER_AUTH_METHODS,
  TASK_TYPES,
} from '@xgcanvas/shared-types';
import { CATALOG_LIFECYCLES } from './types';
import type { CatalogBundleV1, CatalogReleaseAuthoring, ProviderAuthoringDocument } from './types';
import {
  ModelInputContractSchema,
  OptionalModelInputContractSchema,
} from './input-contract-schema';
import { ModelParamSchemaSchema, ParamConstraintSchema } from './param-contract-schema';
import { CatalogPricingSchema } from './pricing-schema';
import { validateNonSecretConfig, validateOutboundBaseUrl } from './outbound-config';

const UuidSchema = z.string().uuid();
const PositiveRevisionSchema = z.number().int().min(1);
const LifecycleSchema = z.enum(CATALOG_LIFECYCLES);
const RecordSchema = z.record(z.unknown());
const OutboundBaseUrlSchema = z.string().superRefine((value, context) => {
  for (const issue of validateOutboundBaseUrl(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  }
});
function nonSecretRecordSchema(fieldName: string) {
  return RecordSchema.superRefine((value, context) => {
    for (const issue of validateNonSecretConfig(value, fieldName)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
    }
  });
}
const NonSecretAuthConfigSchema = nonSecretRecordSchema('auth_config');
const NonSecretRequestConfigSchema = nonSecretRecordSchema('request_config');
const AdapterKeysSchema = z
  .array(z.string().min(1).max(MAX_CATALOG_ADAPTER_KEY_LENGTH))
  .min(1)
  .refine((values) => new Set(values).size === values.length, {
    message: 'adapter_keys must not contain duplicates',
  });

const SourceSchema = z
  .object({
    source_id: UuidSchema,
    namespace: z.string().min(1).max(MAX_CATALOG_NAMESPACE_LENGTH),
    kind: z.enum(['official', 'local']),
  })
  .strict();

const ReleaseSchema = z
  .object({
    release_id: UuidSchema,
    sequence: z.number().int().min(1),
    published_at: z.string().datetime({ offset: true }),
    min_runtime_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .strict();

const ResourceBaseShape = {
  resource_uid: UuidSchema,
  revision: PositiveRevisionSchema,
  slug: z.string().min(1),
  lifecycle: LifecycleSchema,
};

const PollPolicySchema = z
  .object({
    initial_delay_ms: z.number().int().min(0),
    interval_ms: z.number().int().positive(),
    max_total_ms: z.number().int().positive(),
  })
  .strict();

export const CatalogProviderSchema = z
  .object({
    ...ResourceBaseShape,
    slug: z.string().min(1).max(MAX_PROVIDER_SLUG_LENGTH),
    kind: z.literal('provider'),
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    icon_url: z.string().optional(),
    homepage_url: z.string().optional(),
    documentation_url: z.string().optional(),
    description: z.string().optional(),
    auth_method: z.enum(PROVIDER_AUTH_METHODS),
    auth_config: NonSecretAuthConfigSchema.optional(),
    base_url: OutboundBaseUrlSchema.optional(),
    invocation_methods: z.array(z.string().min(1).max(MAX_CATALOG_INVOCATION_METHOD_LENGTH)),
    adapter_keys: AdapterKeysSchema,
    sdk_package: z.string().max(MAX_CATALOG_SDK_PACKAGE_LENGTH).optional(),
    supported_regions: z.array(z.string().min(1)),
  })
  .strict();

export const CatalogChannelTemplateSchema = z
  .object({
    ...ResourceBaseShape,
    slug: z.string().min(1).max(MAX_CHANNEL_SLUG_LENGTH),
    kind: z.literal('channel_template'),
    provider_uid: UuidSchema,
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    invocation_method: z.string().min(1).max(MAX_CATALOG_INVOCATION_METHOD_LENGTH),
    adapter_keys: AdapterKeysSchema,
    base_url: OutboundBaseUrlSchema.optional(),
    request_config: NonSecretRequestConfigSchema,
  })
  .strict();

export const CatalogModelOfferingSchema = z
  .object({
    ...ResourceBaseShape,
    slug: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    kind: z.literal('model_offering'),
    provider_uid: UuidSchema,
    model_id: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    provider_model_id: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    description: z.string().optional(),
    icon_url: z.string().optional(),
    task_types: z.array(z.enum(TASK_TYPES)).min(1),
    capabilities: z.array(z.enum(CAPABILITIES)),
    invocation_mode: z.enum(['sync', 'async', 'stream']),
    adapter_key: z.string().min(1).max(MAX_CATALOG_ADAPTER_KEY_LENGTH),
    supports_streaming: z.boolean(),
    allowed_channel_uids: z.array(UuidSchema).min(1),
    tags: z.array(z.string()),
    param_schema: ModelParamSchemaSchema,
    param_constraints: z.array(ParamConstraintSchema),
    input_contract: ModelInputContractSchema.optional(),
    poll_policy: PollPolicySchema.optional(),
    limits: RecordSchema,
    rate_card_uid: UuidSchema.optional(),
    deprecated_message: z.string().optional(),
  })
  .strict();

export const CatalogRateCardSchema = z
  .object({
    ...ResourceBaseShape,
    slug: z.string().min(1).max(MAX_CATALOG_RESOURCE_SLUG_LENGTH),
    kind: z.literal('rate_card'),
    model_uid: UuidSchema,
    effective_from: z.string().datetime({ offset: true }).optional(),
    pricing: CatalogPricingSchema,
  })
  .strict();

export const CatalogBundleV1Schema: z.ZodType<CatalogBundleV1> = z
  .object({
    format: z.literal('xgcanvas.catalog.bundle'),
    schema_version: z.literal('1'),
    source: SourceSchema,
    release: ReleaseSchema,
    providers: z.array(CatalogProviderSchema),
    channel_templates: z.array(CatalogChannelTemplateSchema),
    model_offerings: z.array(CatalogModelOfferingSchema),
    rate_cards: z.array(CatalogRateCardSchema),
  })
  .strict() as z.ZodType<CatalogBundleV1>;

export const CatalogReleaseAuthoringSchema: z.ZodType<CatalogReleaseAuthoring> = z
  .object({
    format: z.literal('xgcanvas.catalog.authoring'),
    schema_version: z.literal('1'),
    source: SourceSchema,
    release: ReleaseSchema,
  })
  .strict();

const AuthoringIdentityShape = {
  resource_uid: UuidSchema,
  revision: PositiveRevisionSchema,
  lifecycle: LifecycleSchema.optional(),
};

const ProviderAuthoringSchema = z
  .object({
    ...AuthoringIdentityShape,
    slug: z.string().min(1).max(MAX_PROVIDER_SLUG_LENGTH),
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    icon_url: z.string().optional(),
    homepage_url: z.string().optional(),
    documentation_url: z.string().optional(),
    description: z.string().optional(),
    auth_method: z.enum(PROVIDER_AUTH_METHODS).optional(),
    auth_config: NonSecretAuthConfigSchema.optional(),
    base_url: OutboundBaseUrlSchema.optional(),
    invocation_methods: z.array(z.string().max(MAX_CATALOG_INVOCATION_METHOD_LENGTH)).optional(),
    adapter_keys: AdapterKeysSchema,
    sdk_package: z.string().max(MAX_CATALOG_SDK_PACKAGE_LENGTH).optional(),
    supported_regions: z.array(z.string()).optional(),
  })
  .strict();

const ChannelAuthoringSchema = z
  .object({
    ...AuthoringIdentityShape,
    slug: z.string().min(1).max(MAX_CHANNEL_SLUG_LENGTH),
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    invocation_method: z.string().min(1).max(MAX_CATALOG_INVOCATION_METHOD_LENGTH),
    adapter_keys: AdapterKeysSchema,
    base_url: OutboundBaseUrlSchema.optional(),
    request_config: NonSecretRequestConfigSchema.optional(),
  })
  .strict();

const InlineRateCardSchema = z
  .object({
    ...AuthoringIdentityShape,
    slug: z.string().max(MAX_CATALOG_RESOURCE_SLUG_LENGTH).optional(),
    effective_from: z.string().optional(),
    currency: z.string().min(3).max(8),
    components: z
      .array(
        z
          .object({
            meter: z.enum([
              'input_tokens',
              'output_tokens',
              'cached_input_tokens',
              'duration_seconds',
              'image_count',
              'requests',
            ]),
            per: z.number().finite().positive(),
            price: z.number().finite().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const ModelAuthoringSchema = z
  .object({
    ...AuthoringIdentityShape,
    model_id: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    provider_model_id: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    display_name: z.string().min(1).max(MAX_CATALOG_DISPLAY_NAME_LENGTH),
    description: z.string().optional(),
    icon_url: z.string().optional(),
    task_types: z.array(z.string()).min(1),
    capabilities: z.array(z.string()).optional(),
    invocation_mode: z.enum(['sync', 'async', 'stream']).optional(),
    adapter_key: z.string().min(1).max(MAX_CATALOG_ADAPTER_KEY_LENGTH),
    supports_streaming: z.boolean().optional(),
    allowed_channel_slugs: z.array(z.string().min(1).max(MAX_CHANNEL_SLUG_LENGTH)).min(1),
    tags: z.array(z.string()).optional(),
    param_schema: z.unknown().optional(),
    param_constraints: z.array(z.unknown()).optional(),
    input_contract: OptionalModelInputContractSchema,
    poll_policy: PollPolicySchema.optional(),
    limits: RecordSchema.optional(),
    pricing: InlineRateCardSchema.optional(),
    deprecated_message: z.string().optional(),
  })
  .strict();

const RateCardAuthoringSchema = z
  .object({
    ...AuthoringIdentityShape,
    slug: z.string().min(1).max(MAX_CATALOG_RESOURCE_SLUG_LENGTH),
    model_id: z.string().min(1).max(MAX_MODEL_ID_LENGTH),
    effective_from: z.string().optional(),
    pricing: RecordSchema,
  })
  .strict();

export const ProviderAuthoringDocumentSchema: z.ZodType<
  Omit<ProviderAuthoringDocument, 'file_path'>
> = z
  .object({
    version: z.string().optional(),
    provider: ProviderAuthoringSchema.optional(),
    provider_slug: z.string().min(1).max(MAX_PROVIDER_SLUG_LENGTH).optional(),
    channels: z.array(ChannelAuthoringSchema).optional(),
    models: z.array(ModelAuthoringSchema).optional(),
    rate_cards: z.array(RateCardAuthoringSchema).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    if (!document.provider && !document.provider_slug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'provider or provider_slug is required',
      });
    }
    if (
      document.provider &&
      document.provider_slug &&
      document.provider.slug !== document.provider_slug
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider_slug'],
        message: 'provider_slug must match provider.slug',
      });
    }
  }) as z.ZodType<Omit<ProviderAuthoringDocument, 'file_path'>>;
