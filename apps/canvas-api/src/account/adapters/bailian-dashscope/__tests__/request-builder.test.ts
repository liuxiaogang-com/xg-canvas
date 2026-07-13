import type { UnifiedRequest } from '@xgcanvas/adapters-contract';

import { buildBailianImageRequest, buildBailianVideoRequest } from '../request-builder';
import { parseImageAssets, parseTaskStatus } from '../response-parser';

describe('bailian dashscope adapter helpers', () => {
  it('builds image requests with references and normalized params', () => {
    const out = buildBailianImageRequest({
      ...baseReq('gen.image'),
      provider_model: 'wan2.6-t2i',
      inputs: {
        mode: 'image_to_image',
        prompt: 'a clean product photo',
        references: [{ slot: 'source_image', type: 'image', url: 'https://assets.xgcanvas.test/ref.png' }],
      },
      params: {
        resolution: '1024*1024',
        n: 2,
        watermark: false,
        prompt_extend: true,
        seed: -1,
      },
    });

    expect(out).toEqual({
      model: 'wan2.6-t2i',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: 'https://assets.xgcanvas.test/ref.png' },
              { text: 'a clean product photo' },
            ],
          },
        ],
      },
      parameters: {
        size: '1024*1024',
        n: 2,
        watermark: false,
        prompt_extend: true,
      },
    });
  });

  it('builds video requests with frame and audio media slots', () => {
    const out = buildBailianVideoRequest({
      ...baseReq('gen.video'),
      provider_model: 'wan2.7-i2v-2026-04-25',
      inputs: {
        mode: 'first_last_frame',
        prompt: 'camera slowly moves in',
        references: [
          { slot: 'first_frame', type: 'image', url: 'https://assets.xgcanvas.test/first.png' },
          { slot: 'last_frame', type: 'image', url: 'https://assets.xgcanvas.test/last.png' },
          { slot: 'driving_audio', type: 'audio', url: 'https://assets.xgcanvas.test/audio.wav' },
        ],
      },
      params: {
        aspect_ratio: '16:9',
        duration_sec: 5,
        resolution: '1080P',
        negative_prompt: 'low quality',
      },
    });

    expect(out.input).toEqual({
      prompt: 'camera slowly moves in',
      negative_prompt: 'low quality',
      media: [
        { type: 'first_frame', url: 'https://assets.xgcanvas.test/first.png' },
        { type: 'last_frame', url: 'https://assets.xgcanvas.test/last.png' },
        { type: 'driving_audio', url: 'https://assets.xgcanvas.test/audio.wav' },
      ],
    });
    expect(out.parameters).toEqual({
      resolution: '1080P',
      ratio: '16:9',
      duration: 5,
    });
  });

  it('parses image URLs from choices and results', () => {
    expect(
      parseImageAssets({
        output: {
          choices: [{ message: { content: [{ image: 'https://dashscope.test/a.png' }] } }],
          results: [{ url: 'https://dashscope.test/b.png' }],
        },
      }),
    ).toEqual([
      {
        url: 'https://dashscope.test/a.png',
        mime_type: 'image/png',
        filename: 'bailian-image-1.png',
        role: 'main',
      },
      {
        url: 'https://dashscope.test/b.png',
        mime_type: 'image/png',
        filename: 'bailian-image-2.png',
        role: 'main',
      },
    ]);
  });

  it('parses async task states and video outputs', () => {
    expect(parseTaskStatus({ output: { task_status: 'RUNNING' } })).toEqual({
      status: 'running',
      assets: [],
    });
    expect(
      parseTaskStatus({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://dashscope.test/main.mp4',
          results: [{ url: 'https://dashscope.test/cover.png' }],
        },
      }),
    ).toEqual({
      status: 'succeeded',
      assets: [
        {
          url: 'https://dashscope.test/main.mp4',
          mime_type: 'video/mp4',
          filename: 'bailian-result-1.mp4',
          role: 'main',
        },
        {
          url: 'https://dashscope.test/cover.png',
          mime_type: 'image/png',
          filename: 'bailian-result-2.png',
          role: 'result_1',
        },
      ],
    });
  });
});

function baseReq(taskType: 'gen.image' | 'gen.video'): UnifiedRequest {
  return {
    task_type: taskType,
    model_id: `bailian:${taskType}`,
    provider_model: 'model',
    params: {},
    inputs: {},
  };
}
