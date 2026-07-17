import {
  type InvokeCtx,
  type PollResult,
  type ProducedAsset,
  type ProviderAdapter,
  type UnifiedRequest,
  type UnifiedResponse,
  AdapterError,
} from '@xgcanvas/adapters-contract';
import { BUILTIN_ADAPTER_CAPABILITIES, ERROR_CODES } from '@xgcanvas/shared-types';

import { clampPollDelay } from '../_shared/async-poller';
import { mapVendorError } from '../_shared/error-mapper';
import type { DreaminaCliRunner } from '../../dreamina/dreamina-cli.runner';
import type { ObjectStorageClient } from '../../storage/object-storage.client';
import { LocalMediaSession } from './local-media';

const CAPS = BUILTIN_ADAPTER_CAPABILITIES['dreamina-cli'];

/**
 * 即梦 CLI adapter — directly spawns the dreamina binary via
 * DreaminaCliRunner (no Python bridge).  Login state is global per
 * CLI instance (OAuth Device Flow), not per-credential.
 *
 * CLI media flags require **local file paths** (not HTTP URLs). Invoke
 * materializes references[].url into a temp dir before submit.
 *
 * mode + reference slots determine which CLI command to use:
 *   text_to_image      -> text2image
 *   image_to_image     -> image2image
 *   text_to_video      -> text2video
 *   image_to_video     -> image2video
 *   first_last_frame   -> frames2video
 *   reference_to_video -> multimodal2video
 */
export class DreaminaCliAdapter implements ProviderAdapter {
  readonly key = 'dreamina-cli';
  readonly capabilities = CAPS;
  readonly invocationMode = 'async' as const;

  constructor(
    private readonly runner: DreaminaCliRunner,
    private readonly storage: ObjectStorageClient,
  ) {}

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const inputs = req.inputs ?? {};
    const prompt = inputs.prompt ?? '';
    const params = req.params ?? {};
    const session = await LocalMediaSession.create();

    try {
      const localReq = await withLocalMedia(
        req,
        session,
        (url) => this.storage.isTrustedPresignedReadUrl(url),
        ctx.signal,
      );
      const { command, flags } = buildCommand(localReq, prompt, params);
      // Keep media flags as path-only summaries — never log full signed URLs.
      ctx.logger.info('dreamina submit', {
        command,
        media_flags: flags.filter(isMediaFlag).map((f) => f.split('=')[0]),
        media_flag_count: flags.filter(isMediaFlag).length,
      });
      const res = await this.runner.submit(command, flags, ctx.signal);
      return {
        status: 'running',
        external_task_id: res.submit_id,
        assets: [],
        next_poll_after_ms: clampPollDelay(undefined, 3000),
      };
    } catch (e) {
      throw mapVendorError(e);
    } finally {
      await session.dispose();
    }
  }

  async poll(externalTaskId: string, ctx: InvokeCtx): Promise<PollResult> {
    try {
      const res = await this.runner.queryResult(externalTaskId, ctx.signal);
      if (res.gen_status === 'querying') {
        return {
          response: { status: 'running', assets: [] },
          next_poll_after_ms: clampPollDelay(undefined, 3000),
        };
      }
      if (res.gen_status === 'fail') {
        return {
          response: {
            status: 'failed',
            assets: [],
            error: {
              code: ERROR_CODES.CLI_INVOCATION_FAILED,
              message: res.fail_reason ?? 'dreamina task failed',
            },
          },
        };
      }
      // success — download produced media
      const assets: ProducedAsset[] = [];
      for (const img of res.images) {
        const storage = await ctx.downloader.download({ url: img.url, mime_type: 'image/png' });
        assets.push({ asset_type: 'image', storage, role: 'main' });
      }
      for (const vid of res.videos) {
        const storage = await ctx.downloader.download({ url: vid.url, mime_type: 'video/mp4' });
        assets.push({ asset_type: 'video', storage, role: 'main' });
      }
      return { response: { status: 'succeeded', assets } };
    } catch (e) {
      throw mapVendorError(e);
    }
  }

  async cancel(_externalTaskId: string, _ctx: InvokeCtx): Promise<void> {
    // CLI has no cancel command — best-effort no-op
  }
}

/** Map mode + reference slots to a dreamina CLI command and flags. */
function buildCommand(
  req: UnifiedRequest,
  prompt: string,
  params: Record<string, unknown>,
): { command: string; flags: string[] } {
  const flags: string[] = [];
  const refs = references(req);
  if (prompt) flags.push(`--prompt=${prompt}`);
  if (params.ratio) flags.push(`--ratio=${params.ratio}`);
  if (params.model_version) flags.push(`--model_version=${params.model_version}`);
  if (params.resolution_type) flags.push(`--resolution_type=${params.resolution_type}`);
  if (params.video_resolution) flags.push(`--video_resolution=${params.video_resolution}`);
  if (params.duration != null) flags.push(`--duration=${params.duration}`);
  if (params.generate_num) flags.push(`--generate_num=${params.generate_num}`);

  if (req.task_type === 'gen.image') {
    if (req.inputs.mode === 'image_to_image' || req.inputs.mode === 'image_edit') {
      const paths = imagePaths(refs);
      if (paths.length === 0) {
        throw new Error('image_to_image requires at least one local reference image');
      }
      paths.forEach((p) => flags.push(`--images=${p}`));
      return { command: 'image2image', flags };
    }
    return { command: 'text2image', flags };
  }

  if (req.inputs.mode === 'image_to_video') {
    const image = firstPath(refs, ['source_image', 'first_frame', 'reference_image']);
    if (!image) throw new Error('image_to_video requires a local first-frame image');
    flags.push(`--image=${image}`);
    return { command: 'image2video', flags };
  }
  if (req.inputs.mode === 'first_last_frame') {
    const first = firstPath(refs, ['first_frame', 'source_image']);
    const last = firstPath(refs, ['last_frame']);
    if (!first || !last) throw new Error('first_last_frame requires local first and last images');
    flags.push(`--first=${first}`);
    flags.push(`--last=${last}`);
    return { command: 'frames2video', flags };
  }
  if (req.inputs.mode === 'reference_to_video' || req.inputs.mode === 'audio_driven_video') {
    for (const ref of refs) {
      if (!ref.url) continue;
      if (ref.type === 'video' || ref.slot === 'source_video') flags.push(`--video=${ref.url}`);
      else if (ref.type === 'audio' || ref.slot === 'driving_audio')
        flags.push(`--audio=${ref.url}`);
      else flags.push(`--image=${ref.url}`);
    }
    const hasVisual = flags.some((f) => f.startsWith('--image=') || f.startsWith('--video='));
    if (!hasVisual) {
      throw new AdapterError({
        code: ERROR_CODES.CONSTRAINT_VIOLATION,
        message: '全能参考至少需要一张参考图或视频（本地路径）',
        retryable: false,
      });
    }
    if (req.inputs.mode === 'audio_driven_video') {
      const hasAudio = flags.some((f) => f.startsWith('--audio='));
      if (!hasAudio) {
        throw new AdapterError({
          code: ERROR_CODES.CONSTRAINT_VIOLATION,
          message: '音频参考模式至少需要一段参考音频',
          retryable: false,
        });
      }
    }
    return { command: 'multimodal2video', flags };
  }
  return { command: 'text2video', flags };
}

type Ref = NonNullable<UnifiedRequest['inputs']['references']>[number];

async function withLocalMedia(
  req: UnifiedRequest,
  session: LocalMediaSession,
  isTrustedReadUrl: (url: string) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<UnifiedRequest> {
  const refs = references(req);
  if (refs.length === 0) return req;
  const next = await mapWithConcurrency(refs, 3, async (ref) => {
    if (!ref.url) return ref;
    if (!(await isTrustedReadUrl(ref.url))) {
      throw new AdapterError({
        code: ERROR_CODES.CONSTRAINT_VIOLATION,
        message: 'Dreamina media URL is not signed by the active XG Canvas object store',
        retryable: false,
      });
    }
    if (!/^https?:\/\//i.test(ref.url)) {
      throw new AdapterError({
        code: ERROR_CODES.CONSTRAINT_VIOLATION,
        message: 'Dreamina media references must not contain local paths',
        retryable: false,
      });
    }
    return { ...ref, url: await session.fetch(ref.url, signal) };
  });
  return { ...req, inputs: { ...req.inputs, references: next } };
}

function references(req: UnifiedRequest): Ref[] {
  return Array.isArray(req.inputs.references) ? req.inputs.references : [];
}

function imagePaths(refs: Ref[]): string[] {
  return refs
    .filter((r) => r.url && (r.type === 'image' || r.type === 'image_list'))
    .map((r) => r.url as string);
}

function firstPath(refs: Ref[], slots: string[]): string | undefined {
  return refs.find((r) => r.url && slots.includes(r.slot))?.url;
}

function isMediaFlag(flag: string): boolean {
  return (
    flag.startsWith('--images=') ||
    flag.startsWith('--image=') ||
    flag.startsWith('--first=') ||
    flag.startsWith('--last=') ||
    flag.startsWith('--video=') ||
    flag.startsWith('--audio=')
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        out[index] = await worker(values[index]);
      }
    }),
  );
  return out;
}
