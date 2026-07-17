import {
  AdapterError,
  type InvokeCtx,
  type PollResult,
  type ProducedAsset,
  type ProviderAdapter,
  type UnifiedRequest,
  type UnifiedResponse,
} from '@xgcanvas/adapters-contract';
import { BUILTIN_ADAPTER_CAPABILITIES, ERROR_CODES, type ErrorCode } from '@xgcanvas/shared-types';

import { clampPollDelay } from '../_shared/async-poller';
import { mapVendorError } from '../_shared/error-mapper';
import { BailianDashscopeClient } from './client';
import { buildBailianImageRequest, buildBailianVideoRequest } from './request-builder';
import { normalizeBailianUsage, parseImageAssets, parseTaskStatus } from './response-parser';
import type { BailianCredential, DashScopeImageResponse } from './types';

const CAPS = BUILTIN_ADAPTER_CAPABILITIES['bailian-dashscope'];

export class BailianDashscopeAdapter implements ProviderAdapter {
  readonly key = 'bailian-dashscope';
  readonly capabilities = CAPS;
  readonly invocationMode = 'async' as const;

  constructor(private readonly client = new BailianDashscopeClient()) {}

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const cred = readCredential(ctx);
    try {
      if (req.task_type === 'gen.image') {
        const res = await this.client.generateImage(
          ctx.channel.base_url,
          buildBailianImageRequest(req),
          cred,
          ctx.signal,
        );
        const stubs = parseImageAssets(res);
        if (stubs.length === 0) {
          throw new AdapterError({
            code: ERROR_CODES.VENDOR_REJECTED,
            message: res.message ?? 'bailian image response returned no image',
            vendor: res,
          });
        }
        let assets: ProducedAsset[];
        try {
          assets = await downloadAssets(ctx, stubs);
        } catch (error) {
          throw acceptedIngestionError(error, res);
        }
        return { status: 'succeeded', assets, usage: normalizeBailianUsage(res.usage) };
      }

      const res = await this.client.submitVideo(
        ctx.channel.base_url,
        buildBailianVideoRequest(req),
        cred,
        ctx.signal,
      );
      const taskId = res.output?.task_id;
      if (!taskId) {
        throw new AdapterError({
          code: ERROR_CODES.VENDOR_REJECTED,
          message: res.message ?? 'bailian video submit returned no task_id',
          vendor: res,
        });
      }
      return {
        status: 'running',
        external_task_id: taskId,
        assets: [],
        next_poll_after_ms: clampPollDelay(undefined, 10_000),
      };
    } catch (e) {
      throw mapVendorError(e, resolveBailianCode);
    }
  }

  async poll(externalTaskId: string, ctx: InvokeCtx): Promise<PollResult> {
    const cred = readCredential(ctx);
    try {
      const response = await this.client.getTask(
        ctx.channel.base_url,
        externalTaskId,
        cred,
        ctx.signal,
      );
      const parsed = parseTaskStatus(response);
      if (parsed.status !== 'succeeded') {
        return {
          response: {
            status: parsed.status === 'failed' ? 'failed' : 'running',
            assets: [],
            error:
              parsed.status === 'failed'
                ? { code: ERROR_CODES.VENDOR_REJECTED, message: parsed.errorMessage ?? 'failed' }
                : undefined,
          },
          next_poll_after_ms:
            parsed.status === 'running' ? clampPollDelay(undefined, 10_000) : undefined,
        };
      }
      return {
        response: {
          status: 'succeeded',
          assets: await downloadAssets(ctx, parsed.assets),
          usage: normalizeBailianUsage(response.usage),
        },
      };
    } catch (e) {
      throw mapVendorError(e, resolveBailianCode);
    }
  }

  async cancel(externalTaskId: string, ctx: InvokeCtx): Promise<void> {
    const cred = readCredential(ctx);
    try {
      await this.client.cancelTask(ctx.channel.base_url, externalTaskId, cred, ctx.signal);
    } catch (e) {
      ctx.logger.warn('bailian cancel failed; treating as best-effort', { error: String(e) });
    }
  }
}

async function downloadAssets(
  ctx: InvokeCtx,
  stubs: Array<{ url: string; mime_type?: string; filename?: string; role?: string }>,
): Promise<ProducedAsset[]> {
  const assets: ProducedAsset[] = [];
  for (const stub of stubs) {
    const storage = await ctx.downloader.download({
      url: stub.url,
      mime_type: stub.mime_type,
      filename: stub.filename,
    });
    assets.push({
      asset_type: stub.mime_type?.startsWith('video/') ? 'video' : 'image',
      storage,
      role: stub.role,
    });
  }
  return assets;
}

function acceptedIngestionError(error: unknown, response: DashScopeImageResponse): AdapterError {
  const mapped = mapVendorError(error);
  return new AdapterError({
    code: mapped.code,
    message: `vendor image succeeded but asset ingestion failed: ${mapped.message}`,
    retryable: false,
    vendor: {
      vendor_request_id: response.request_id ?? null,
      ingestion_error: mapped.vendor ?? { code: mapped.code, message: mapped.message },
    },
    httpStatus: mapped.httpStatus,
    dispatch_outcome: 'accepted',
    accepted_result: {
      usage: normalizeBailianUsage(response.usage),
      vendor_request_id: response.request_id,
    },
  });
}

function readCredential(ctx: InvokeCtx): BailianCredential {
  const p = ctx.credential.payload as Record<string, unknown>;
  const apiKey = p.api_key ?? p.apiKey ?? p.dashscope_api_key;
  if (typeof apiKey !== 'string' || !apiKey) {
    throw new AdapterError({
      code: ERROR_CODES.CREDENTIAL_INVALID,
      message: 'bailian credential requires api_key',
    });
  }
  return { apiKey };
}

function resolveBailianCode(vendor: unknown): ErrorCode | null {
  const code = extractVendorCode(vendor);
  if (!code) return null;
  if (/invalid.*key|api.?key/i.test(code)) return ERROR_CODES.CREDENTIAL_INVALID;
  if (/throttl|rate|limit/i.test(code)) return ERROR_CODES.RATE_LIMITED;
  if (/quota|balance|insufficient/i.test(code)) return ERROR_CODES.QUOTA_EXCEEDED;
  if (/inspection|content|safety|policy/i.test(code)) return ERROR_CODES.VENDOR_CONTENT_FILTERED;
  if (/internal|unavailable|timeout/i.test(code)) return ERROR_CODES.VENDOR_UNAVAILABLE;
  return null;
}

function extractVendorCode(vendor: unknown): string | null {
  if (!vendor || typeof vendor !== 'object') return null;
  const v = vendor as Record<string, any>;
  return v.code ?? v.output?.code ?? null;
}
