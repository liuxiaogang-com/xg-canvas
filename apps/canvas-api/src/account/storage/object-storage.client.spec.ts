import { ServiceUnavailableException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageClient } from './object-storage.client';

describe('ObjectStorageClient settings', () => {
  let row: any = null;
  const repo = {
    findOne: jest.fn(async () => row),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      row = value;
      return value;
    }),
  };
  const encryption = {
    encrypt: jest.fn(async (value) => ({ encrypted: Buffer.from(JSON.stringify(value)), keyId: 'v1' })),
    decrypt: jest.fn(async (value: Buffer) => JSON.parse(value.toString('utf8'))),
  };

  beforeEach(() => {
    row = null;
    jest.clearAllMocks();
  });

  it('allows the application to start without storage but fails on first use', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    await expect(storage.bucket()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(storage.getSettingsView()).resolves.toMatchObject({ configured: false });
  });

  it('stores secrets encrypted and never returns them', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    const view = await storage.updateSettings({
      endpoint: 'https://storage.example.com',
      region: 'auto',
      bucket: 'assets',
      access_key: 'access',
      secret_key: 'secret',
    });
    expect(encryption.encrypt).toHaveBeenCalledWith({ access_key: 'access', secret_key: 'secret' });
    expect(view).toMatchObject({ configured: true, bucket: 'assets', has_secret_key: true });
    expect(view).not.toHaveProperty('secret_key');
    expect(view).not.toHaveProperty('access_key');
  });

  it('keeps existing secrets when an update leaves them blank', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    await storage.updateSettings({
      endpoint: 'storage.example.com', bucket: 'assets', access_key: 'access', secret_key: 'secret',
    });
    await storage.updateSettings({ endpoint: 'storage.example.com', bucket: 'assets-2' });
    expect(encryption.encrypt).toHaveBeenLastCalledWith({ access_key: 'access', secret_key: 'secret' });
  });

  it('signs browser GET and PUT against browser_s3_endpoint and binds Content-Type', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    await storage.updateSettings({
      endpoint: 'http://internal-storage:9000',
      browser_s3_endpoint: 'https://objects.example.com',
      bucket: 'assets',
      access_key: 'access',
      secret_key: 'secret',
    });

    const get = new URL(await storage.getObjectUrl('path/image.png', 60));
    const put = new URL(await storage.putObjectUrl('path/image.png', 60, 'image/png'));
    expect(get.origin).toBe('https://objects.example.com');
    expect(put.origin).toBe('https://objects.example.com');
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
    expect(put.searchParams.has('X-Amz-Signature')).toBe(true);
  });

  it('reads legacy public_host as the browser S3 endpoint', async () => {
    row = {
      key: 'object_storage',
      public_config: {
        endpoint: 'http://internal-storage:9000',
        public_host: 'legacy-browser.example.com',
        bucket: 'assets', region: 'auto', use_ssl: true, force_path_style: true,
      },
      encrypted_payload: Buffer.from(JSON.stringify({ access_key: 'access', secret_key: 'secret' })),
    };
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    const view = await storage.getSettingsView();
    expect(view.browser_s3_endpoint).toBe('https://legacy-browser.example.com');
    expect(view.public_host).toBe('https://legacy-browser.example.com');
    expect(new URL(await storage.getObjectUrl('a.png', 60)).origin).toBe('https://legacy-browser.example.com');
    await expect(storage.updateSettings({
      endpoint: 'http://internal-storage:9000', bucket: 'assets',
      browser_s3_endpoint: view.browser_s3_endpoint,
    })).resolves.toMatchObject({ verified: false, browser_s3_endpoint: 'https://legacy-browser.example.com' });
  });

  it('returns null only for HeadObject 404 and propagates storage failures', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    const send = jest.fn();
    (storage as any).runtime = {
      settings: { bucket: 'assets' },
      client: { send },
      publicClient: { send },
    };
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(storage.headObject('missing')).resolves.toBeNull();
    const denied = Object.assign(new Error('denied'), { $metadata: { httpStatusCode: 403 } });
    send.mockRejectedValueOnce(denied);
    await expect(storage.headObject('denied')).rejects.toBe(denied);
    const falseNotFound = Object.assign(new Error('upstream failed'), {
      name: 'NotFound', $metadata: { httpStatusCode: 500 },
    });
    send.mockRejectedValueOnce(falseNotFound);
    await expect(storage.headObject('failed')).rejects.toBe(falseNotFound);
  });

  it('tests read/write/delete, saves verified_at, and clears it on a later update', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: any) => {
      if (command.constructor.name === 'HeadObjectCommand') return { ContentLength: 22 } as never;
      return {} as never;
    });
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    const tested = await storage.testSettings({
      endpoint: 'https://storage.example.com', bucket: 'assets', access_key: 'access', secret_key: 'secret',
    });
    expect(tested).toMatchObject({ configured: true, verified: true });
    expect(tested.verified_at).toEqual(expect.any(String));
    expect(send.mock.calls.map(([command]) => (command as any).constructor.name)).toEqual([
      'PutObjectCommand', 'HeadObjectCommand', 'DeleteObjectCommand',
    ]);
    await expect(storage.readinessStatus()).resolves.toBe('ready');

    const updated = await storage.updateSettings({ endpoint: 'https://storage.example.com', bucket: 'assets-2' });
    expect(updated).toMatchObject({ configured: true, verified: false, verified_at: null });
    await expect(storage.readinessStatus()).resolves.toBe('unverified');
    send.mockRestore();
  });

  it('rejects malformed or conflicting browser endpoints before persisting', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    await expect(storage.updateSettings({
      endpoint: 'https://storage.example.com', bucket: 'assets',
      browser_s3_endpoint: 'objects.example.com', access_key: 'access', secret_key: 'secret',
    })).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await expect(storage.updateSettings({
      endpoint: 'https://storage.example.com', bucket: 'assets',
      browser_s3_endpoint: 'https://one.example.com', public_host: 'https://two.example.com',
      access_key: 'access', secret_key: 'secret',
    })).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('accepts adapter downloads only from the active signed-read origin and path', async () => {
    const storage = new ObjectStorageClient(repo as never, encryption as never);
    jest.spyOn(storage, 'getObjectUrl').mockResolvedValue(
      'https://objects.example.com/assets/__xgcanvas_read_origin_probe__?X-Amz-Signature=probe',
    );

    await expect(
      storage.isTrustedPresignedReadUrl(
        'https://objects.example.com/assets/tasks/output.png?X-Amz-Signature=signed',
      ),
    ).resolves.toBe(true);
    await expect(
      storage.isTrustedPresignedReadUrl('https://169.254.169.254/latest/meta-data?X-Amz-Signature=fake'),
    ).resolves.toBe(false);
    await expect(
      storage.isTrustedPresignedReadUrl('https://objects.example.com/assets/tasks/output.png'),
    ).resolves.toBe(false);
  });
});
