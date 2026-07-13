import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdapterError, type DecryptedCredential } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import { ModelCredential } from '../credential/credential.entity';
import { EncryptionService } from '../credential/encryption.service';

@Injectable()
export class CredentialResolverService {
  constructor(
    @InjectRepository(ModelCredential) private readonly creds: Repository<ModelCredential>,
    private readonly enc: EncryptionService,
  ) {}

  /**
   * Pick an enabled credential for the channel.
   * Availability intentionally does not depend on validation probes or expiry.
   */
  async select(channelId: string, pinCredentialId?: string): Promise<DecryptedCredential> {
    const list = await this.listCandidates(channelId, pinCredentialId);
    if (list.length === 0) {
      throw new AdapterError({
        code: ERROR_CODES.CREDENTIAL_INVALID,
        message: pinCredentialId
          ? `credential ${pinCredentialId} unavailable`
          : `no enabled credential for channel ${channelId}`,
      });
    }
    return list[0].decrypted;
  }

  /**
   * Enabled credentials for the channel, least-recently-used first. Each carries
   * its label for logging. A pinned credential collapses to a single candidate.
   */
  async listCandidates(
    channelId: string,
    pinCredentialId?: string,
  ): Promise<{ decrypted: DecryptedCredential; label: string | null }[]> {
    const rows = pinCredentialId
      ? await this.creds.find({ where: { id: pinCredentialId, channel_id: channelId, enabled: true } })
      : await this.creds
          .createQueryBuilder('c')
          .where('c.channel_id = :id', { id: channelId })
          .andWhere('c.enabled = true')
          .orderBy('c.last_used_at', 'ASC', 'NULLS FIRST')
          .getMany();
    const out: { decrypted: DecryptedCredential; label: string | null }[] = [];
    for (const cred of rows) {
      const payload = (await this.enc.decrypt(cred.encrypted_payload)) ?? {};
      out.push({
        decrypted: { id: cred.id, channel_id: cred.channel_id, type: this.mapType(cred.credential_type), payload },
        label: cred.label,
      });
    }
    return out;
  }

  async markUsed(credentialId: string): Promise<void> {
    await this.creds.update(credentialId, {
      last_used_at: new Date(),
      total_usage_count: () => 'total_usage_count + 1',
    } as never);
  }

  private mapType(t: string): DecryptedCredential['type'] {
    if (t === 'oauth_token') return 'oauth';
    if (t === 'cookie' || t === 'cli_session') return 'cli_session';
    return 'api_key';
  }
}
