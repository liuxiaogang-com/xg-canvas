import type { Repository } from 'typeorm';

import { ModelCredential } from '../credential/credential.entity';
import type { EncryptionService } from '../credential/encryption.service';
import { CredentialResolverService } from './credential-resolver.service';

describe('CredentialResolverService', () => {
  it('scopes a pinned credential lookup to the requested channel', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as unknown as Repository<ModelCredential>;
    const encryption = { decrypt: jest.fn() } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await service.listCandidates('channel-a', 'credential-a');

    expect(find).toHaveBeenCalledWith({
      where: { id: 'credential-a', channel_id: 'channel-a', enabled: true },
    });
  });

  it('decrypts a pinned credential returned for the exact channel', async () => {
    const encryptedPayload = Buffer.from('encrypted');
    const credential = {
      id: 'credential-a',
      channel_id: 'channel-a',
      credential_type: 'api_key',
      encrypted_payload: encryptedPayload,
      label: 'primary',
    } as ModelCredential;
    const repo = {
      find: jest.fn().mockResolvedValue([credential]),
    } as unknown as Repository<ModelCredential>;
    const decrypt = jest.fn().mockResolvedValue({ api_key: 'secret' });
    const encryption = { decrypt } as unknown as EncryptionService;
    const service = new CredentialResolverService(repo, encryption);

    await expect(service.listCandidates('channel-a', 'credential-a')).resolves.toEqual([
      {
        decrypted: {
          id: 'credential-a',
          channel_id: 'channel-a',
          type: 'api_key',
          payload: { api_key: 'secret' },
        },
        label: 'primary',
      },
    ]);
    expect(decrypt).toHaveBeenCalledWith(encryptedPayload);
  });
});
