import { ReadStream } from 'node:fs';

import type { ObjectStorageClient } from './object-storage.client';
import { AssetDownloaderService } from './asset-downloader.service';

jest.mock('../../common/http/guarded-outbound', () => ({
  guardedFetch: (input: string | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

describe('AssetDownloaderService', () => {
  const storage = {
    bucket: jest.fn(),
    putObject: jest.fn(),
  } as unknown as ObjectStorageClient;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (storage.bucket as jest.Mock).mockResolvedValue('assets');
    (storage.putObject as jest.Mock).mockResolvedValue(undefined);
  });

  it('streams vendor bytes through a temp file instead of buffering the whole asset', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    const downloader = new AssetDownloaderService(storage).forTask(context());

    await expect(
      downloader.download({ url: 'https://vendor.test/output.png' }),
    ).resolves.toMatchObject({
      size_bytes: 3,
      mime_type: 'image/png',
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ Body: expect.any(ReadStream), ContentLength: 3 }),
    );
  });

  it('stops a chunked response at the configured byte cap', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const downloader = new AssetDownloaderService(storage).forTask(context());

    await expect(
      downloader.download({ url: 'https://vendor.test/output.bin', max_bytes: 2 }),
    ).rejects.toMatchObject({ code: 'ASSET_TOO_LARGE' });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('propagates a lost task lease into an in-flight vendor download', async () => {
    const controller = new AbortController();
    controller.abort(new Error('task lease lost'));
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(init?.signal?.reason);
    });
    const downloader = new AssetDownloaderService(storage).forTask(context(controller.signal));

    await expect(downloader.download({ url: 'https://vendor.test/output.bin' })).rejects.toThrow(
      'task lease lost',
    );
  });
});

function context(signal?: AbortSignal) {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    taskId: '22222222-2222-4222-8222-222222222222',
    signal,
  };
}
