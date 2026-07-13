import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptionKeyringStore } from './encryption-keyring.store';

function config(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] };
}

function database(options: { encrypted?: boolean; referenced?: number[] } = {}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_advisory_')) return [];
    if (sql.includes('SELECT EXISTS')) return [{ present: options.encrypted ?? false }];
    return (options.referenced ?? []).map((key_number) => ({ key_number }));
  });
  return {
    query,
    createQueryRunner: () => ({
      connect: jest.fn(async () => undefined),
      query,
      release: jest.fn(async () => undefined),
    }),
  };
}

describe('EncryptionKeyringStore', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xgcanvas-keyring-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('generates a persistent v1 key on an empty instance and reuses it', async () => {
    const values = { XGCANVAS_SECRET_DIR: root };
    const first = await new EncryptionKeyringStore(config(values) as never, database() as never)
      .loadOrCreate();
    const second = await new EncryptionKeyringStore(config(values) as never, database() as never)
      .loadOrCreate();

    expect(first.source).toBe('generated');
    expect(second.source).toBe('file');
    expect(second.keys.get('v1')).toEqual(first.keys.get('v1'));
    expect(existsSync(join(root, 'keyring.json'))).toBe(true);
  });

  it('imports legacy environment keys without logging or returning their text', async () => {
    const legacy = Buffer.alloc(32, 7).toString('base64');
    const first = await new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root, ENCRYPTION_KEY_V1: legacy }) as never,
      database() as never,
    ).loadOrCreate();
    const second = await new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root }) as never,
      database() as never,
    ).loadOrCreate();

    expect(first.source).toBe('environment');
    expect(second.keys.get('v1')?.toString('base64')).toBe(legacy);
  });

  it('refuses to generate a replacement when encrypted database data already exists', async () => {
    const store = new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root }) as never,
      database({ encrypted: true }) as never,
    );

    await expect(store.loadOrCreate()).rejects.toThrow('数据库中已有加密数据');
    expect(existsSync(join(root, 'keyring.json'))).toBe(false);
  });

  it('fails fast when the file and an environment key conflict', async () => {
    const firstKey = Buffer.alloc(32, 1).toString('base64');
    const secondKey = Buffer.alloc(32, 2).toString('base64');
    await new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root, ENCRYPTION_KEY_V1: firstKey }) as never,
      database() as never,
    ).loadOrCreate();

    const store = new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root, ENCRYPTION_KEY_V1: secondKey }) as never,
      database() as never,
    );
    await expect(store.loadOrCreate()).rejects.toThrow('内容冲突');
  });

  it('fails fast for a corrupt keyring and for missing historical keys', async () => {
    writeFileSync(join(root, 'keyring.json'), '{broken', 'utf8');
    const corrupt = new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root }) as never,
      database() as never,
    );
    await expect(corrupt.loadOrCreate()).rejects.toThrow('无法读取加密 keyring');

    writeFileSync(
      join(root, 'keyring.json'),
      JSON.stringify({
        version: 1,
        currentKeyId: 'v1',
        keys: { v1: Buffer.alloc(32, 3).toString('base64') },
      }),
      'utf8',
    );
    const missing = new EncryptionKeyringStore(
      config({ XGCANVAS_SECRET_DIR: root }) as never,
      database({ referenced: [2] }) as never,
    );
    await expect(missing.loadOrCreate()).rejects.toThrow('v2');
  });

  it('converges on one key when two initializers start together', async () => {
    const values = { XGCANVAS_SECRET_DIR: root };
    const [left, right] = await Promise.all([
      new EncryptionKeyringStore(config(values) as never, database() as never).loadOrCreate(),
      new EncryptionKeyringStore(config(values) as never, database() as never).loadOrCreate(),
    ]);

    expect(left.keys.get('v1')).toEqual(right.keys.get('v1'));
    expect(JSON.parse(readFileSync(join(root, 'keyring.json'), 'utf8')).version).toBe(1);
  });
});
