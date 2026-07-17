import { CredentialService } from './credential.service';

const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL_UID = '33333333-3333-4333-8333-333333333333';

describe('CredentialService transactional Catalog contract', () => {
  it('rejects a create payload against the Provider auth method re-read in the mutation', async () => {
    const fixture = makeFixture('cli_login');

    await expect(
      fixture.service.create(CHANNEL_UID, {
        credential_type: 'api_key',
        credentials: { api_key: 'stale-snapshot-key' },
      }),
    ).rejects.toThrow('empty cli_session credential marker');

    expect(fixture.catalogWrites.requireCredentialOwnerInTransaction).toHaveBeenCalledWith(
      fixture.manager,
      CHANNEL_UID,
    );
    expect(fixture.encryption.encrypt).not.toHaveBeenCalled();
    expect(fixture.repo.save).not.toHaveBeenCalled();
  });

  it('validates replacement payloads against the current Provider inside the same mutation', async () => {
    const fixture = makeFixture('cli_login', credentialRow());

    await expect(
      fixture.service.update(CREDENTIAL_UID, {
        credentials: { api_key: 'stale-snapshot-key' },
      }),
    ).rejects.toThrow('empty cli_session credential marker');

    expect(fixture.encryption.encrypt).not.toHaveBeenCalled();
    expect(fixture.repo.save).not.toHaveBeenCalled();
  });

  it('encrypts and persists only after the current transactional owner accepts the contract', async () => {
    const fixture = makeFixture('api_key');

    await expect(
      fixture.service.create(CHANNEL_UID, {
        credential_type: 'api_key',
        credentials: { api_key: 'current-key' },
      }),
    ).resolves.toMatchObject({
      channel_resource_uid: CHANNEL_UID,
      credential_type: 'api_key',
      payload_fields: ['api_key'],
    });

    expect(fixture.encryption.encrypt).toHaveBeenCalledWith({ api_key: 'current-key' });
    expect(fixture.repo.save).toHaveBeenCalledTimes(1);
  });

  it('persists validation as a conditional field-only update', async () => {
    const existing = credentialRow();
    const fixture = makeFixture('api_key', existing);

    await expect(fixture.service.validate(CREDENTIAL_UID)).resolves.toMatchObject({
      id: CREDENTIAL_UID,
      is_valid: true,
      validation_error: null,
    });

    expect(fixture.repo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CREDENTIAL_UID,
        encrypted_payload: existing.encrypted_payload,
        encryption_key_id: 'v1',
      }),
      expect.objectContaining({ is_valid: true, validation_error: null }),
    );
    expect(fixture.repo.save).not.toHaveBeenCalled();
  });

  it('discards a validation result when the credential payload changed concurrently', async () => {
    const fixture = makeFixture('api_key', credentialRow());
    fixture.repo.update.mockResolvedValueOnce({ affected: 0 });

    await expect(fixture.service.validate(CREDENTIAL_UID)).rejects.toThrow(
      'changed while validation was running',
    );

    expect(fixture.repo.save).not.toHaveBeenCalled();
  });

  it('does not resurrect a credential archived while validation was in flight', async () => {
    const fixture = makeFixture('api_key', credentialRow());
    fixture.repo.update.mockResolvedValueOnce({ affected: 0 });
    fixture.repo.findOneBy.mockResolvedValueOnce(credentialRow()).mockResolvedValueOnce(null);

    await expect(fixture.service.validate(CREDENTIAL_UID)).rejects.toThrow(
      `Credential ${CREDENTIAL_UID} not found`,
    );

    expect(fixture.repo.save).not.toHaveBeenCalled();
  });
});

function makeFixture(authMethod: string, existing?: ReturnType<typeof credentialRow>) {
  const repo = {
    create: jest.fn((value: Record<string, unknown>) => credentialRow(value)),
    save: jest.fn(async (value: unknown) => value),
    findOneBy: jest.fn(async () => existing ?? null),
    update: jest.fn(async (_criteria: unknown, values: Record<string, unknown>) => {
      if (existing) Object.assign(existing, values);
      return { affected: existing ? 1 : 0 };
    }),
  };
  const manager = { getRepository: jest.fn(() => repo) };
  const bootstrap = { mutateLocal: jest.fn((work: (value: unknown) => unknown) => work(manager)) };
  const encryption = {
    encrypt: jest.fn(async () => ({ encrypted: Buffer.from('encrypted'), keyId: 'v1' })),
    decrypt: jest.fn(async () => ({ api_key: 'stored-key' })),
  };
  const catalogWrites = {
    requireCredentialOwnerInTransaction: jest.fn(async () => ({
      provider: { document: { auth_method: authMethod } },
      channel: { document: { resource_uid: CHANNEL_UID } },
    })),
  };
  const registry = {
    getChannel: jest.fn(() => ({
      document: {
        provider_uid: '11111111-1111-4111-8111-111111111111',
        base_url: 'https://api.example.com',
      },
      config_overrides: {},
    })),
    getProvider: jest.fn(() => ({
      document: { slug: 'example', auth_method: authMethod, base_url: null },
      config_overrides: {},
    })),
  };
  const vendorStatus = {
    pingModels: jest.fn(async () => ({ ok: true })),
  };
  const service = new CredentialService(
    repo as never,
    registry as never,
    bootstrap as never,
    encryption as never,
    vendorStatus as never,
    catalogWrites as never,
  );
  return { service, repo, manager, encryption, catalogWrites };
}

function credentialRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CREDENTIAL_UID,
    channel_resource_uid: CHANNEL_UID,
    label: null,
    credential_type: 'api_key',
    encrypted_payload: Buffer.from('encrypted'),
    encryption_key_id: 'v1',
    payload_fields: ['api_key'],
    enabled: true,
    is_valid: false,
    last_validated_at: null,
    validation_error: null,
    expires_at: null,
    last_used_at: null,
    total_usage_count: '0',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    archived_at: null,
    ...overrides,
  };
}
