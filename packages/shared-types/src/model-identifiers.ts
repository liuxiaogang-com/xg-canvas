export const MAX_MODEL_ID_LENGTH = 200;
export const MAX_PROVIDER_SLUG_LENGTH = 50;
export const MAX_CHANNEL_SLUG_LENGTH = 100;
export const MAX_CATALOG_RESOURCE_SLUG_LENGTH = 240;
export const MAX_CATALOG_NAMESPACE_LENGTH = 200;
export const MAX_CATALOG_DISPLAY_NAME_LENGTH = 200;
export const MAX_CATALOG_INVOCATION_METHOD_LENGTH = 20;
export const MAX_CATALOG_ADAPTER_KEY_LENGTH = 50;
export const MAX_CATALOG_SDK_PACKAGE_LENGTH = 200;

export const PROVIDER_AUTH_METHODS = ['api_key', 'cli_login'] as const;
export type ProviderAuthMethod = (typeof PROVIDER_AUTH_METHODS)[number];
