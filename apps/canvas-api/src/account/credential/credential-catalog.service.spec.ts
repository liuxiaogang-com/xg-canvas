import { CredentialCatalogService } from './credential-catalog.service';

describe('CredentialCatalogService', () => {
  it('returns the credential-scoped structural projection without encrypted payloads', async () => {
    const credential = {
      id: '11111111-1111-4111-8111-111111111111',
      channel_resource_uid: '22222222-2222-4222-8222-222222222222',
      label: 'main',
      credential_type: 'api_key',
      encrypted_payload: Buffer.from('must-not-leak'),
      encryption_key_id: 'v1',
      payload_fields: ['api_key'],
      enabled: true,
      is_valid: true,
      last_validated_at: null,
      validation_error: null,
      expires_at: null,
      last_used_at: null,
      total_usage_count: '9007199254740993',
      created_by: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    };
    const repo = { find: jest.fn(async () => [credential]) };
    const registry = {
      isReady: jest.fn(() => true),
      getSnapshot: jest.fn(() => snapshotFixture()),
    };
    const service = new CredentialCatalogService(repo as never, registry as never);

    const view = await service.getView();

    expect(view).toMatchObject({
      catalog_epoch: '42',
      providers: [{ resource_uid: 'provider-uid', auth_method: 'api_key' }],
      channels: [{ resource_uid: '22222222-2222-4222-8222-222222222222' }],
      models: [{ resource_uid: 'model-uid', adapter_key: 'openai-compat' }],
      credentials: [
        {
          id: credential.id,
          payload_fields: ['api_key'],
          total_usage_count: '9007199254740993',
        },
      ],
    });
    expect(view.credentials[0]).not.toHaveProperty('encrypted_payload');
    expect(view.credentials[0]).not.toHaveProperty('encryption_key_id');
  });

  it('fails closed while the runtime registry is unavailable', async () => {
    const service = new CredentialCatalogService(
      {} as never,
      {
        isReady: () => false,
      } as never,
    );
    await expect(service.getView()).rejects.toThrow('model registry is not ready');
  });
});

function snapshotFixture() {
  return {
    catalog_epoch: '42',
    providersByResourceUid: new Map([
      [
        'provider-uid',
        {
          document: {
            resource_uid: 'provider-uid',
            slug: 'example',
            display_name: 'Example',
            auth_method: 'api_key',
            adapter_keys: ['openai-compat'],
          },
        },
      ],
    ]),
    channelsByResourceUid: new Map([
      [
        'channel-uid',
        {
          document: {
            resource_uid: '22222222-2222-4222-8222-222222222222',
            provider_uid: 'provider-uid',
            slug: 'example-openai',
            display_name: 'Example OpenAI',
            adapter_keys: ['openai-compat'],
          },
          enabled: true,
        },
      ],
    ]),
    byId: new Map([
      [
        'example:model',
        {
          document: {
            resource_uid: 'model-uid',
            provider_uid: 'provider-uid',
            model_id: 'example:model',
            provider_model_id: 'model',
            display_name: 'Example Model',
            task_types: ['gen.text'],
            adapter_key: 'openai-compat',
            allowed_channel_uids: ['22222222-2222-4222-8222-222222222222'],
          },
          manifest: { enabled: true },
          origin: {
            kind: 'official',
            source_id: 'source-uid',
            resource_uid: 'model-uid',
            revision: 1,
            revision_id: 'revision-uid',
            release_id: 'release-uid',
          },
        },
      ],
    ]),
  };
}
