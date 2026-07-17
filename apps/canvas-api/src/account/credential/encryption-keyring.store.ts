import { randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type QueryRunner } from 'typeorm';

interface SerializedKeyring {
  version: 1;
  currentKeyId: string;
  keys: Record<string, string>;
}

export interface EncryptionKeyring {
  currentKeyId: string;
  keys: Map<string, Buffer>;
}

export interface KeyringLoadResult extends EncryptionKeyring {
  source: 'file' | 'environment' | 'file+environment' | 'generated';
  path: string;
}

@Injectable()
export class EncryptionKeyringStore {
  private readonly secretDir: string;
  private readonly keyringPath: string;

  constructor(
    private readonly config: ConfigService,
    private readonly ds: DataSource,
  ) {
    this.secretDir = resolve(
      this.config.get<string>('XGCANVAS_SECRET_DIR')?.trim()
        || join(process.cwd(), '.xgcanvas', 'secrets'),
    );
    this.keyringPath = join(this.secretDir, 'keyring.json');
  }

  async loadOrCreate(): Promise<KeyringLoadResult> {
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    let locked = false;
    try {
      await runner.query(`SELECT pg_advisory_lock(hashtext('xgcanvas:encryption-keyring'))`);
      locked = true;
      return await this.loadOrCreateLocked(runner);
    } finally {
      try {
        if (locked) {
          await runner.query(`SELECT pg_advisory_unlock(hashtext('xgcanvas:encryption-keyring'))`);
        }
      } finally {
        await runner.release();
      }
    }
  }

  private async loadOrCreateLocked(runner: QueryRunner): Promise<KeyringLoadResult> {
    this.ensureDirectory();
    const env = this.readEnvironment();
    let keyring: EncryptionKeyring;
    let source: KeyringLoadResult['source'];

    if (existsSync(this.keyringPath)) {
      keyring = this.readKeyring();
      source = 'file';
      if (env.keys.size || env.currentKeyId) {
        keyring = this.mergeEnvironment(keyring, env);
        this.writeAtomically(keyring);
        source = 'file+environment';
      }
    } else if (env.keys.size) {
      const currentKeyId = env.currentKeyId ?? 'v1';
      keyring = { currentKeyId, keys: env.keys };
      this.validateKeyring(keyring);
      const created = this.writeNewOrRead(keyring);
      keyring = created.keyring;
      source = created.created ? 'environment' : 'file';
    } else {
      if (await this.hasEncryptedPayloads(runner)) {
        throw new Error(
          `加密根密钥不存在，但数据库中已有加密数据。请恢复 ${this.keyringPath} 的备份或旧 ENCRYPTION_KEY_V*，服务拒绝生成新密钥`,
        );
      }
      if (env.currentKeyId && env.currentKeyId !== 'v1') {
        throw new Error(`ENCRYPTION_KEY_CURRENT=${env.currentKeyId}，但没有提供对应密钥`);
      }
      keyring = {
        currentKeyId: 'v1',
        keys: new Map([['v1', randomBytes(32)]]),
      };
      const created = this.writeNewOrRead(keyring);
      keyring = created.keyring;
      source = created.created ? 'generated' : 'file';
    }

    await this.assertReferencedKeysExist(runner, keyring);
    return { ...keyring, source, path: this.keyringPath };
  }

  private readEnvironment(): { keys: Map<string, Buffer>; currentKeyId?: string } {
    const keys = new Map<string, Buffer>();
    for (let i = 1; i <= 255; i += 1) {
      const name = `ENCRYPTION_KEY_V${i}`;
      const raw = this.config.get<string>(name)?.trim();
      if (raw) keys.set(`v${i}`, decodeKey(raw, name));
    }
    const current = this.config.get<string>('ENCRYPTION_KEY_CURRENT')?.trim();
    if (current) assertKeyId(current, 'ENCRYPTION_KEY_CURRENT');
    return { keys, currentKeyId: current || undefined };
  }

  private mergeEnvironment(
    file: EncryptionKeyring,
    env: { keys: Map<string, Buffer>; currentKeyId?: string },
  ): EncryptionKeyring {
    const keys = new Map(file.keys);
    for (const [keyId, key] of env.keys) {
      const existing = keys.get(keyId);
      if (existing && !existing.equals(key)) {
        throw new Error(`${keyId} 在 keyring 与环境变量中的内容冲突，拒绝启动`);
      }
      keys.set(keyId, key);
    }
    const merged = { currentKeyId: env.currentKeyId ?? file.currentKeyId, keys };
    this.validateKeyring(merged);
    return merged;
  }

  private readKeyring(): EncryptionKeyring {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.keyringPath, 'utf8'));
    } catch (error) {
      throw new Error(`无法读取加密 keyring ${this.keyringPath}: ${errorMessage(error)}`);
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('加密 keyring 格式无效');
    const value = parsed as Partial<SerializedKeyring>;
    if (value.version !== 1 || !value.keys || typeof value.keys !== 'object') {
      throw new Error('加密 keyring 版本或 keys 格式无效');
    }
    const keys = new Map<string, Buffer>();
    for (const [keyId, raw] of Object.entries(value.keys)) {
      assertKeyId(keyId, 'keyring key id');
      if (typeof raw !== 'string') throw new Error(`keyring ${keyId} 不是字符串`);
      keys.set(keyId, decodeKey(raw, `keyring ${keyId}`));
    }
    const keyring = { currentKeyId: String(value.currentKeyId ?? ''), keys };
    this.validateKeyring(keyring);
    return keyring;
  }

  private validateKeyring(keyring: EncryptionKeyring): void {
    assertKeyId(keyring.currentKeyId, 'currentKeyId');
    if (!keyring.keys.size) throw new Error('加密 keyring 不能为空');
    if (!keyring.keys.has(keyring.currentKeyId)) {
      throw new Error(`当前密钥 ${keyring.currentKeyId} 不存在于 keyring`);
    }
  }

  private writeNewOrRead(keyring: EncryptionKeyring): {
    keyring: EncryptionKeyring;
    created: boolean;
  } {
    try {
      writeFileSync(this.keyringPath, serializeKeyring(keyring), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      chmodSync(this.keyringPath, 0o600);
      return { keyring, created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return { keyring: this.readKeyring(), created: false };
      }
      throw error;
    }
  }

  private writeAtomically(keyring: EncryptionKeyring): void {
    const temporary = `${this.keyringPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, serializeKeyring(keyring), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, this.keyringPath);
      chmodSync(this.keyringPath, 0o600);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  private ensureDirectory(): void {
    mkdirSync(this.secretDir, { recursive: true, mode: 0o700 });
    chmodSync(this.secretDir, 0o700);
  }

  private async hasEncryptedPayloads(runner: QueryRunner): Promise<boolean> {
    const rows = await runner.query(
      `SELECT EXISTS (
         SELECT 1 FROM account.credentials
          WHERE encrypted_payload IS NOT NULL
         UNION ALL
         SELECT 1 FROM account.system_settings WHERE encrypted_payload IS NOT NULL
       ) AS present`,
    );
    return rows[0]?.present === true;
  }

  private async assertReferencedKeysExist(
    runner: QueryRunner,
    keyring: EncryptionKeyring,
  ): Promise<void> {
    const rows = await runner.query(
      `SELECT DISTINCT get_byte(payload, 0) AS key_number
       FROM (
         SELECT encrypted_payload AS payload FROM account.credentials
         UNION ALL
         SELECT encrypted_payload AS payload FROM account.system_settings
       ) encrypted
       WHERE payload IS NOT NULL AND octet_length(payload) > 0`,
    );
    const missing = rows
      .map((row: { key_number: number | string }) => `v${Number(row.key_number)}`)
      .filter((keyId: string) => !keyring.keys.has(keyId));
    if (missing.length) {
      throw new Error(`keyring 缺少数据库密文仍在使用的密钥: ${[...new Set(missing)].join(', ')}`);
    }
  }
}

function serializeKeyring(keyring: EncryptionKeyring): string {
  const keys = Object.fromEntries([...keyring.keys].map(([id, key]) => [id, key.toString('base64')]));
  return `${JSON.stringify({ version: 1, currentKeyId: keyring.currentKeyId, keys }, null, 2)}\n`;
}

function decodeKey(raw: string, label: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) {
    throw new Error(`${label} 必须是 32 字节的标准 Base64`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64') !== raw) {
    throw new Error(`${label} 必须是 32 字节的标准 Base64`);
  }
  return key;
}

function assertKeyId(keyId: string, label: string): void {
  const match = /^v([1-9]\d*)$/.exec(keyId);
  const number = match ? Number(match[1]) : 0;
  if (!match || number > 255) throw new Error(`${label} 必须是 v1 到 v255`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
