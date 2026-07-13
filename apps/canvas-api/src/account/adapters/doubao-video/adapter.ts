import {
  AdapterError,
  type InvokeCtx,
  type PollResult,
  type ProducedAsset,
  type ProviderAdapter,
  type UnifiedRequest,
  type UnifiedResponse,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type TaskType } from '@xgcanvas/shared-types';

import { clampPollDelay } from '../_shared/async-poller';
import { mapVendorError } from '../_shared/error-mapper';
import { DoubaoVideoClient, type DoubaoVideoCredential } from './client';
import { buildDoubaoVideoSubmit } from './request-builder';
import { parseDoubaoVideoStatus } from './response-parser';

const CAPS: readonly TaskType[] = ['gen.video'];

export class DoubaoVideoAdapter implements ProviderAdapter {
  readonly key = 'doubao-video';
  readonly capabilities = CAPS;
  readonly invocationMode = 'async' as const;

  constructor(private readonly client = new DoubaoVideoClient()) {}

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const cred = readCredential(ctx);
    try {
      const res = await this.client.submit(buildDoubaoVideoSubmit(req), cred);
      const taskId = res.data?.task_id;
      if (!taskId) {
        throw new AdapterError({
          code: ERROR_CODES.VENDOR_REJECTED,
          message: res.message ?? 'doubao video submit returned no task_id',
          vendor: res,
        });
      }
      return {
        status: 'running',
        external_task_id: taskId,
        assets: [],
        next_poll_after_ms: clampPollDelay(undefined, 5000),
      };
    } catch (e) {
      throw mapVendorError(e);
    }
  }

  async poll(externalTaskId: string, ctx: InvokeCtx): Promise<PollResult> {
    const cred = readCredential(ctx);
    try {
      const parsed = parseDoubaoVideoStatus(await this.client.query(externalTaskId, cred));
      if (parsed.status !== 'succeeded' || !parsed.videoStub) {
        return {
          response: {
            status: parsed.status === 'failed' ? 'failed' : 'running',
            assets: [],
            error:
              parsed.status === 'failed'
                ? { code: ERROR_CODES.VENDOR_REJECTED, message: parsed.errorMessage ?? 'failed' }
                : undefined,
          },
          next_poll_after_ms: parsed.status === 'running' ? clampPollDelay(undefined, 5000) : undefined,
        };
      }
      const assets: ProducedAsset[] = [];
      const video = await ctx.downloader.download({
        url: parsed.videoStub.url,
        mime_type: parsed.videoStub.mime_type,
      });
      assets.push({ asset_type: 'video', storage: video, role: 'main' });
      if (parsed.coverStub) {
        const cover = await ctx.downloader.download({
          url: parsed.coverStub.url,
          mime_type: parsed.coverStub.mime_type,
        });
        assets.push({ asset_type: 'image', storage: cover, role: 'cover' });
      }
      return { response: { status: 'succeeded', assets } };
    } catch (e) {
      throw mapVendorError(e);
    }
  }
}

function readCredential(ctx: InvokeCtx): DoubaoVideoCredential {
  const p = ctx.credential.payload as Record<string, unknown>;
  const ak = p.ak ?? p.access_key;
  const sk = p.sk ?? p.secret_key;
  if (typeof ak !== 'string' || typeof sk !== 'string') {
    throw new AdapterError({
      code: ERROR_CODES.CREDENTIAL_INVALID,
      message: 'doubao credential requires ak/sk',
    });
  }
  return { ak, sk };
}
