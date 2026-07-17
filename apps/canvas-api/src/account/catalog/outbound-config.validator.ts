import { validateNonSecretConfig, validateOutboundBaseUrl } from '@xgcanvas/model-catalog';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export function IsSafeOutboundBaseUrl(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSafeOutboundBaseUrl',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && validateOutboundBaseUrl(value).length === 0,
        defaultMessage: () =>
          'base_url must be an absolute HTTPS URL without userinfo, fragments, or secret query parameters',
      },
    },
    options,
  );
}

export function HasNoSecretLikeConfigKeys(
  fieldName = 'configuration',
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'hasNoSecretLikeConfigKeys',
      validator: {
        validate: (value: unknown) =>
          Boolean(value) &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          validateNonSecretConfig(value, fieldName).length === 0,
        defaultMessage: () => `${fieldName} must not contain secret-like keys at any depth`,
      },
    },
    options,
  );
}
