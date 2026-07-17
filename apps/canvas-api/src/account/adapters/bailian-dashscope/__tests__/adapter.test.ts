import { AdapterError, type InvokeCtx, type UnifiedRequest } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import { BailianDashscopeAdapter } from '../adapter';

describe('BailianDashscopeAdapter synchronous image ingestion', () => {
  const imageResponse = {
    request_id: 'vendor-request-1',
    output: {
      choices: [
        { message: { content: [{ type: 'image', image: 'https://vendor.test/result.png' }] } },
      ],
    },
    usage: { image_count: 1, size: '1024*1024' },
  };

  it('marks a vendor-completed download failure as accepted and preserves usage', async () => {
    const client = bailianClient(imageResponse);
    const download = jest.fn().mockRejectedValue(
      new AdapterError({
        code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
        message: 'object storage unavailable',
        retryable: true,
      }),
    );
    const adapter = new BailianDashscopeAdapter(client as never);

    const error = await adapter
      .invoke(imageRequest(), invokeContext(download))
      .catch((caught: unknown) => caught as AdapterError);

    expect(error).toMatchObject({
      code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
      retryable: false,
      dispatch_outcome: 'accepted',
      accepted_result: {
        usage: { image_count: 1 },
        vendor_request_id: 'vendor-request-1',
      },
    });
    expect(client.generateImage).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('returns vendor-reported usage after successful ingestion', async () => {
    const client = bailianClient(imageResponse);
    const download = jest.fn().mockResolvedValue({
      storage_key: 'xgcanvas/workspace/task/result.png',
      bucket: 'assets',
      size_bytes: 10,
      mime_type: 'image/png',
      sha256: 'abc123',
    });
    const adapter = new BailianDashscopeAdapter(client as never);

    await expect(adapter.invoke(imageRequest(), invokeContext(download))).resolves.toMatchObject({
      status: 'succeeded',
      usage: { image_count: 1 },
      assets: [{ asset_type: 'image' }],
    });
    expect(client.generateImage).toHaveBeenCalledTimes(1);
  });
});

function bailianClient(response: unknown) {
  return {
    generateImage: jest.fn().mockResolvedValue(response),
    submitVideo: jest.fn(),
    getTask: jest.fn(),
    cancelTask: jest.fn(),
  };
}

function imageRequest(): UnifiedRequest {
  return {
    task_type: 'gen.image',
    model_id: 'bailian:test-image',
    provider_model: 'test-image',
    params: {},
    inputs: { prompt: 'a test image' },
  };
}

function invokeContext(download: jest.Mock): InvokeCtx {
  return {
    task_id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    channel: {
      resource_uid: '33333333-3333-4333-8333-333333333333',
      key: 'bailian-native',
      base_url: 'https://dashscope.aliyuncs.com/api/v1',
    },
    credential: {
      id: '44444444-4444-4444-8444-444444444444',
      channel_resource_uid: '33333333-3333-4333-8333-333333333333',
      type: 'api_key',
      payload: { api_key: 'test-only' },
    },
    downloader: { download },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
}
