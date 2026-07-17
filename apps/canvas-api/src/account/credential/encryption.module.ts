import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EncryptionKeyringStore } from './encryption-keyring.store';
import { EncryptionService } from './encryption.service';

/**
 * Shared encryption boundary for credentials and system settings.
 *
 * Keep this module independent from the credential workflow so storage can
 * encrypt settings without creating Storage -> Credential -> Registry ->
 * Adapters -> Storage module cycles.
 */
@Module({
  imports: [ConfigModule],
  providers: [EncryptionKeyringStore, EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
