import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionKeyringStore } from './encryption-keyring.store';

/**
 * 凭证加密服务
 *
 * 使用 AES-256-GCM 加密凭证数据
 * 根密钥来自持久化 keyring；旧 ENCRYPTION_KEY_V* 会被安全导入。
 *
 * 存储格式: [keyIdByte(1)][iv(12)][authTag(16)][ciphertext(N)]
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private keys = new Map<string, Buffer>();
  private currentKeyId!: string;

  constructor(private readonly keyringStore: EncryptionKeyringStore) {}

  async onModuleInit(): Promise<void> {
    await this.loadKeys();
  }

  /** 加载持久化 keyring；兼容环境变量首次导入和显式轮转。 */
  private async loadKeys(): Promise<void> {
    const loaded = await this.keyringStore.loadOrCreate();
    this.currentKeyId = loaded.currentKeyId;
    this.keys = new Map(loaded.keys);
    this.logger.log(
      `加密 keyring 已就绪: source=${loaded.source}, current=${this.currentKeyId}, keys=${this.keys.size}, path=${loaded.path}`,
    );
  }

  /**
   * 加密凭证数据
   */
  async encrypt(plainObject: Record<string, any>): Promise<{
    encrypted: Buffer;
    keyId: string;
  }> {
    const key = this.keys.get(this.currentKeyId)!;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const json = JSON.stringify(plainObject);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // 组装: [keyIdByte][iv][authTag][ciphertext]
    const keyIdByte = this.keyIdToByte(this.currentKeyId);
    const result = Buffer.concat([
      Buffer.from([keyIdByte]),
      iv,         // 12 bytes
      authTag,    // 16 bytes
      encrypted,  // N bytes
    ]);

    return { encrypted: result, keyId: this.currentKeyId };
  }

  /**
   * 解密凭证数据
   */
  async decrypt(encryptedPayload: Buffer): Promise<Record<string, any>> {
    if (encryptedPayload.length < 29) {
      throw new Error('加密数据格式无效：长度不足');
    }

    const keyIdByte = encryptedPayload[0];
    const iv = encryptedPayload.subarray(1, 13);
    const authTag = encryptedPayload.subarray(13, 29);
    const ciphertext = encryptedPayload.subarray(29);

    const keyId = this.byteToKeyId(keyIdByte);
    const key = this.keys.get(keyId);

    if (!key) {
      throw new Error(`解密失败：密钥 ${keyId} 未找到（可能已被轮转移除）`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * 重新加密（用当前密钥），用于 key rotation
   */
  async reEncrypt(encryptedPayload: Buffer): Promise<{
    encrypted: Buffer;
    keyId: string;
  }> {
    const plain = await this.decrypt(encryptedPayload);
    return this.encrypt(plain);
  }

  /**
   * 获取当前密钥 ID
   */
  getCurrentKeyId(): string {
    return this.currentKeyId;
  }

  /**
   * 检查加密数据使用的是否是当前密钥
   */
  isCurrentKey(encryptedPayload: Buffer): boolean {
    if (encryptedPayload.length < 1) return false;
    const keyId = this.byteToKeyId(encryptedPayload[0]);
    return keyId === this.currentKeyId;
  }

  private keyIdToByte(keyId: string): number {
    // v1 -> 1, v2 -> 2, ...
    const match = keyId.match(/^v(\d+)$/);
    const value = match ? parseInt(match[1], 10) : 0;
    if (!match || value < 1 || value > 255) throw new Error(`无效的密钥 ID 格式: ${keyId}`);
    return value;
  }

  private byteToKeyId(byte: number): string {
    return `v${byte}`;
  }
}
