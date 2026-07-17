import type { Repository } from 'typeorm';

import { ModelCredential } from '../credential/credential.entity';
import type { EncryptionService } from '../credential/encryption.service';
import { CredentialResolverService } from './credential-resolver.service';

describe('CredentialResolverService', () => {
  it('scopes a pinned credential lookup to the exact Channel resource UID', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as unknown as Repository<ModelCredential>;
    const encryption = { decrypt: jest.fn() } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await service.listCandidates('11111111-1111-4111-8111-111111111111', 'credential-a');

    expect(find).toHaveBeenCalledWith({
      where: {
        id: 'credential-a',
        channel_resource_uid: '11111111-1111-4111-8111-111111111111',
        enabled: true,
        archived_at: expect.anything(),
      },
    });
  });

  it('decrypts a pinned credential and preserves its Channel resource identity', async () => {
    const encryptedPayload = Buffer.from('encrypted');
    const credential = {
      id: 'credential-a',
      channel_resource_uid: '11111111-1111-4111-8111-111111111111',
      credential_type: 'api_key',
      encrypted_payload: encryptedPayload,
      label: 'primary',
    } as unknown as ModelCredential;
    const repo = {
      find: jest.fn().mockResolvedValue([credential]),
    } as unknown as Repository<ModelCredential>;
    const decrypt = jest.fn().mockResolvedValue({ api_key: 'secret' });
    const encryption = { decrypt } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await expect(
      service.listCandidates('11111111-1111-4111-8111-111111111111', 'credential-a'),
    ).resolves.toEqual([
      {
        decrypted: {
          id: 'credential-a',
          channel_resource_uid: '11111111-1111-4111-8111-111111111111',
          type: 'api_key',
          payload: { api_key: 'secret' },
        },
        label: 'primary',
      },
    ]);
    expect(decrypt).toHaveBeenCalledWith(encryptedPayload);
  });

  it('allows an archived or disabled exact credential only for historical Task cleanup', async () => {
    const encryptedPayload = Buffer.from('archived-encrypted');
    const credential = {
      id: 'credential-a',
      channel_resource_uid: '11111111-1111-4111-8111-111111111111',
      credential_type: 'api_key',
      encrypted_payload: encryptedPayload,
      label: 'archived',
      enabled: false,
      archived_at: new Date(),
    } as unknown as ModelCredential;
    const find = jest.fn().mockResolvedValue([credential]);
    const repo = { find } as unknown as Repository<ModelCredential>;
    const encryption = {
      decrypt: jest.fn().mockResolvedValue({ api_key: 'secret' }),
    } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await expect(
      service.selectHistorical(credential.channel_resource_uid, credential.id),
    ).resolves.toMatchObject({ id: credential.id, payload: { api_key: 'secret' } });
    expect(find).toHaveBeenCalledWith({
      where: {
        id: credential.id,
        channel_resource_uid: credential.channel_resource_uid,
      },
    });
  });

  it('fails closed instead of mapping an unknown credential type to api_key', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'credential-a',
          channel_resource_uid: '11111111-1111-4111-8111-111111111111',
          credential_type: 'legacy-token',
          encrypted_payload: Buffer.from('encrypted'),
          label: null,
        },
      ]),
    } as unknown as Repository<ModelCredential>;
    const encryption = {
      decrypt: jest.fn().mockResolvedValue({ token: 'secret' }),
    } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await expect(
      service.listCandidates('11111111-1111-4111-8111-111111111111', 'credential-a'),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_INVALID' });
  });
});
