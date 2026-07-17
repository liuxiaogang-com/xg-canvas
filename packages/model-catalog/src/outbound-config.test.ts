import { describe, expect, it } from 'vitest';
import {
  REDACTED_SECRET,
  redactOutboundUrl,
  redactSecretLikeValues,
  redactSecretText,
  validateNonSecretConfig,
  validateNonSecretRequestConfig,
  validateOutboundBaseUrl,
} from './outbound-config';
import { CatalogChannelTemplateSchema, ProviderAuthoringDocumentSchema } from './schema';

describe('outbound catalog configuration', () => {
  it('accepts HTTPS endpoints with non-secret query configuration', () => {
    expect(validateOutboundBaseUrl('https://gateway.example/v1?api-version=2026-07-01')).toEqual(
      [],
    );
  });

  it.each([
    ['http://gateway.example/v1', 'HTTPS'],
    ['https://user:pass@gateway.example/v1', 'userinfo'],
    ['https://gateway.example/v1?api_key=secret', 'secret-like'],
    ['https://gateway.example/v1?X-Amz-Signature=secret', 'secret-like'],
    ['https://gateway.example/v1#token=secret', 'fragment'],
  ])('rejects unsafe endpoint %s', (value, expectedMessage) => {
    expect(
      validateOutboundBaseUrl(value)
        .map((issue) => issue.message)
        .join(' '),
    ).toContain(expectedMessage);
  });

  it('rejects nested secret-like config keys without rejecting token counters', () => {
    expect(
      validateNonSecretRequestConfig({
        headers: { Authorization: 'Bearer secret' },
        nested: [{ clientSecret: 'secret' }, { refresh_token: 'secret' }],
      }).map((issue) => issue.path.join('.')),
    ).toEqual(
      expect.arrayContaining([
        'headers.Authorization',
        'nested.0.clientSecret',
        'nested.1.refresh_token',
      ]),
    );
    expect(
      validateNonSecretRequestConfig({ max_tokens: 4096, token_usage_mode: 'reported' }),
    ).toEqual([]);
    expect(
      validateNonSecretConfig({ headers: { Authorization: 'Bearer secret' } }, 'auth_config').map(
        (issue) => issue.path.join('.'),
      ),
    ).toContain('headers.Authorization');
    expect(
      validateNonSecretConfig(
        {
          custom_header: 'Bearer sk-test-secret',
          callback: 'https://gateway.example/cb?X-Amz-Signature=test-secret',
        },
        'request_config',
      ).map((issue) => issue.path.join('.')),
    ).toEqual(expect.arrayContaining(['custom_header', 'callback']));
  });

  it('applies the same checks to authoring and compiled Catalog schemas', () => {
    const provider = ProviderAuthoringDocumentSchema.safeParse({
      provider: {
        resource_uid: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        slug: 'unsafe',
        display_name: 'Unsafe',
        adapter_keys: ['openai-compat'],
        base_url: 'http://gateway.example/v1',
      },
    });
    expect(provider.success).toBe(false);

    const providerAuth = ProviderAuthoringDocumentSchema.safeParse({
      provider: {
        resource_uid: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        slug: 'unsafe-auth',
        display_name: 'Unsafe Auth',
        adapter_keys: ['openai-compat'],
        auth_config: { headers: { Authorization: 'Bearer secret' } },
      },
    });
    expect(providerAuth.success).toBe(false);

    const channel = CatalogChannelTemplateSchema.safeParse({
      kind: 'channel_template',
      resource_uid: '22222222-2222-4222-8222-222222222222',
      revision: 1,
      lifecycle: 'active',
      slug: 'unsafe',
      provider_uid: '11111111-1111-4111-8111-111111111111',
      display_name: 'Unsafe',
      invocation_method: 'http',
      adapter_keys: ['openai-compat'],
      base_url: 'https://gateway.example/v1',
      request_config: { headers: { apiKey: 'secret' } },
    });
    expect(channel.success).toBe(false);
  });

  it('deep-redacts secret keys and URL credentials for persistence projections', () => {
    expect(
      redactSecretLikeValues({
        headers: { authorization: 'Bearer secret', trace_id: 'trace' },
        attempts: [{ password: 'secret' }],
        message: 'upstream failed with Bearer sk-test-secret',
        signed_url: 'https://cdn.example/a?X-Amz-Signature=test-secret&v=1',
      }),
    ).toEqual({
      headers: { authorization: REDACTED_SECRET, trace_id: 'trace' },
      attempts: [{ password: REDACTED_SECRET }],
      message: `upstream failed with Bearer ${REDACTED_SECRET}`,
      signed_url: expect.not.stringContaining('test-secret'),
    });
    const url = redactOutboundUrl('https://user:pass@gateway.example/v1?api_key=secret&v=1');
    expect(url).not.toContain('user');
    expect(url).not.toContain('pass');
    expect(url).not.toContain('secret');
    expect(url).toContain('v=1');
    expect(redactSecretText('Authorization: Basic dGVzdDpzZWNyZXQ=')).toBe(
      `Authorization: ${REDACTED_SECRET}`,
    );
  });
});
