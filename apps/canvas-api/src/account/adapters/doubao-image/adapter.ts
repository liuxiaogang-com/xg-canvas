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

import { mapVendorError } from '../_shared/error-mapper';
import { clampPollDelay } from '../_shared/async-poller';
import { DoubaoImageClient, type DoubaoCredential } from './client';
import { buildDoubaoImageSubmit } from './request-builder';
import { parseDoubaoStatus } from './response-parser';

const CAPS: readonly TaskType[] = ['gen.image'];

export class DoubaoImageAdapter implements ProviderAdapter {
  readonly key = 'doubao-image';
  readonly capabilities = CAPS;
  readonly invocationMode = 'async' as const;

  constructor(private readonly client = new DoubaoImageClient()) {}

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const cred = readCredential(ctx);
    try {
      const submit = buildDoubaoImageSubmit(req);
      const res = await this.client.submit(submit, cred);
      const taskId = res.data?.task_id;
      if (!taskId) {
        throw new AdapterError({
          code: ERROR_CODES.VENDOR_REJECTED,
          message: res.message ?? 'doubao submit returned no task_id',
          vendor: res,
        });
      }
      return {
        status: 'running',
        external_task_id: taskId,
        assets: [],
        next_poll_after_ms: clampPollDelay(undefined, 1500),
      };
    } catch (e) {
      throw mapVendorError(e);
    }
  }

  async poll(externalTaskId: string, ctx: InvokeCtx): Promise<PollResult> {
    const cred = readCredential(ctx);
    try {
      const res = await this.client.query(externalTaskId, cred);
      const parsed = parseDoubaoStatus(res);
      if (parsed.status !== 'succeeded') {
        return {
          response: {
            status: parsed.status === 'failed' ? 'failed' : 'running',
            assets: [],
            error: parsed.status === 'failed'
              ? { code: ERROR_CODES.VENDOR_REJECTED, message: parsed.errorMessage ?? 'failed' }
              : undefined,
          },
          next_poll_after_ms: parsed.status === 'running' ? clampPollDelay(undefined) : undefined,
        };
      }
      const assets: ProducedAsset[] = [];
      for (const stub of parsed.assets) {
        const storage = await ctx.downloader.download({
          url: stub.url,
          mime_type: stub.mime_type,
          filename: stub.filename,
        });
        assets.push({ asset_type: 'image', storage, role: stub.role });
      }
      return { response: { status: 'succeeded', assets } };
    } catch (e) {
      throw mapVendorError(e);
    }
  }
}

function readCredential(ctx: InvokeCtx): DoubaoCredential {
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
