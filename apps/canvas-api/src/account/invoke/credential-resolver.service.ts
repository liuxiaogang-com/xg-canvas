import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AdapterError, type DecryptedCredential } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';
import { IsNull, Repository } from 'typeorm';
import { ModelCredential } from '../credential/credential.entity';
import { EncryptionService } from '../credential/encryption.service';

@Injectable()
export class CredentialResolverService {
  constructor(
    @InjectRepository(ModelCredential) private readonly creds: Repository<ModelCredential>,
    private readonly enc: EncryptionService,
  ) {}

  async select(
    channelResourceUid: string,
    pinnedCredentialId?: string,
  ): Promise<DecryptedCredential> {
    const list = await this.listCandidates(channelResourceUid, pinnedCredentialId);
    if (list.length === 0) {
      throw new AdapterError({
        code: ERROR_CODES.CREDENTIAL_INVALID,
        message: pinnedCredentialId
          ? `credential ${pinnedCredentialId} unavailable`
          : `no enabled credential for channel ${channelResourceUid}`,
      });
    }
    return list[0].decrypted;
  }

  async listCandidates(
    channelResourceUid: string,
    pinnedCredentialId?: string,
  ): Promise<{ decrypted: DecryptedCredential; label: string | null }[]> {
    const rows = pinnedCredentialId
      ? await this.creds.find({
          where: {
            id: pinnedCredentialId,
            channel_resource_uid: channelResourceUid,
            enabled: true,
            archived_at: IsNull(),
          },
        })
      : await this.creds
          .createQueryBuilder('credential')
          .where('credential.channel_resource_uid = :channelResourceUid', { channelResourceUid })
          .andWhere('credential.enabled = true')
          .andWhere('credential.archived_at IS NULL')
          .orderBy('credential.last_used_at', 'ASC', 'NULLS FIRST')
          .getMany();
    return this.decryptRows(rows);
  }

  /** Exact route for an already-dispatched Task; admin disable/archive must not strand it. */
  async selectHistorical(
    channelResourceUid: string,
    credentialId: string,
  ): Promise<DecryptedCredential> {
    const rows = await this.creds.find({
      where: { id: credentialId, channel_resource_uid: channelResourceUid },
    });
    const [result] = await this.decryptRows(rows);
    if (!result) {
      throw new AdapterError({
        code: ERROR_CODES.CREDENTIAL_INVALID,
        message: `historical credential ${credentialId} is unavailable`,
      });
    }
    return result.decrypted;
  }

  private async decryptRows(
    rows: ModelCredential[],
  ): Promise<{ decrypted: DecryptedCredential; label: string | null }[]> {
    const result: { decrypted: DecryptedCredential; label: string | null }[] = [];
    for (const credential of rows) {
      const payload = (await this.enc.decrypt(credential.encrypted_payload)) ?? {};
      result.push({
        decrypted: {
          id: credential.id,
          channel_resource_uid: credential.channel_resource_uid,
          type: this.mapType(credential.credential_type),
          payload,
        },
        label: credential.label,
      });
    }
    return result;
  }

  async markUsed(credentialId: string): Promise<void> {
    await this.creds.update(credentialId, {
      last_used_at: new Date(),
      total_usage_count: () => 'total_usage_count + 1',
    } as never);
  }

  private mapType(value: string): DecryptedCredential['type'] {
    if (value === 'api_key' || value === 'cli_session') return value;
    throw new AdapterError({
      code: ERROR_CODES.CREDENTIAL_INVALID,
      message: `unsupported credential type: ${value}`,
    });
  }
}
