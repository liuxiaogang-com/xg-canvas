import type { CatalogChannelTemplate, CatalogProvider } from '@xgcanvas/model-catalog';

import {
  assertEnabledCredentialContracts,
  type EnabledCredentialSnapshotRow,
} from './registry-snapshot.integrity';

const PROVIDER_UID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';

describe('enabled Credential Snapshot integrity', () => {
  it.each([
    ['api_key', 'api_key', ['api_key']],
    ['cli_login', 'cli_session', []],
  ] as const)('accepts the exact %s marker contract', (authMethod, credentialType, fields) => {
    expect(() =>
      validate(credential(credentialType, [...fields]), provider(authMethod), channel()),
    ).not.toThrow();
  });

  it('rejects an enabled Credential whose Channel is absent or terminal', () => {
    expect(() =>
      assertEnabledCredentialContracts(
        [credential('api_key', ['api_key'])],
        new Map(),
        new Map([[PROVIDER_UID, provider('api_key')]]),
      ),
    ).toThrow(`references unavailable current channel ${CHANNEL_UID}`);

    expect(() =>
      validate(credential('api_key', ['api_key']), provider('api_key'), channel('retired')),
    ).toThrow(`references unavailable current channel ${CHANNEL_UID}`);
  });

  it('rejects an enabled Credential whose Channel Provider is absent or terminal', () => {
    expect(() =>
      assertEnabledCredentialContracts(
        [credential('api_key', ['api_key'])],
        new Map([[CHANNEL_UID, channel()]]),
        new Map(),
      ),
    ).toThrow(`unavailable current provider ${PROVIDER_UID}`);

    expect(() =>
      validate(credential('api_key', ['api_key']), provider('api_key', 'revoked'), channel()),
    ).toThrow(`unavailable current provider ${PROVIDER_UID}`);
  });

  it.each([
    ['api_key', 'cli_session', []],
    ['api_key', 'api_key', []],
    ['api_key', 'api_key', ['api_key', 'unexpected']],
    ['cli_login', 'api_key', ['api_key']],
    ['cli_login', 'cli_session', ['cookie']],
  ] as const)(
    'rejects auth=%s with type=%s and payload fields=%j',
    (authMethod, credentialType, fields) => {
      expect(() =>
        validate(credential(credentialType, [...fields]), provider(authMethod), channel()),
      ).toThrow(/does not match provider example auth_method/);
    },
  );

  it('fails closed for unknown Provider auth methods and corrupt field metadata', () => {
    expect(() =>
      validate(credential('oauth_token', ['token']), provider('oauth' as never), channel()),
    ).toThrow('credential management does not support auth_method oauth');

    expect(() =>
      validate(credential('api_key', ['api_key', 'api_key']), provider('api_key'), channel()),
    ).toThrow('invalid payload_fields metadata');
  });
});

function validate(
  row: EnabledCredentialSnapshotRow,
  providerDocument: CatalogProvider,
  channelDocument: CatalogChannelTemplate,
): void {
  assertEnabledCredentialContracts(
    [row],
    new Map([[channelDocument.resource_uid, channelDocument]]),
    new Map([[providerDocument.resource_uid, providerDocument]]),
  );
}

function credential(credentialType: string, payloadFields: string[]): EnabledCredentialSnapshotRow {
  return {
    id: 'credential-a',
    channel_resource_uid: CHANNEL_UID,
    credential_type: credentialType,
    payload_fields: payloadFields,
  };
}

function provider(
  authMethod: CatalogProvider['auth_method'],
  lifecycle: CatalogProvider['lifecycle'] = 'active',
): CatalogProvider {
  return {
    kind: 'provider',
    resource_uid: PROVIDER_UID,
    revision: 1,
    lifecycle,
    slug: 'example',
    display_name: 'Example',
    auth_method: authMethod,
    auth_config: {},
    invocation_methods: ['http'],
    adapter_keys: ['test-adapter'],
    supported_regions: [],
  };
}

function channel(
  lifecycle: CatalogChannelTemplate['lifecycle'] = 'active',
): CatalogChannelTemplate {
  return {
    kind: 'channel_template',
    resource_uid: CHANNEL_UID,
    revision: 1,
    lifecycle,
    slug: 'example-default',
    provider_uid: PROVIDER_UID,
    display_name: 'Example Default',
    invocation_method: 'http',
    adapter_keys: ['test-adapter'],
    request_config: {},
  };
}
