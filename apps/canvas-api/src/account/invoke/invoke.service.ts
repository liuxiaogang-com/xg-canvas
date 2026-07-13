import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  AdapterError,
  type DecryptedCredential,
  type InvokeCtx,
  type ProviderAdapter,
  type UnifiedRequest,
  type UnifiedResponse,
  wrapUnknownVendorError,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type TaskType } from '@xgcanvas/shared-types';

import { RequestLogService } from '../../request-log/request-log.service';
import { ModelChannel } from '../channel/channel.entity';
import { AssetDownloaderService } from '../storage';
import { RegistryService } from '../registry';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { InvokeRequestDto } from './dto/invoke-request.dto';
import { normalizeInputsForContract, validateInputContract } from './input-contract.validator';

/** Max (channel × credential) attempts per invoke before giving up (C3 failover). */
const MAX_FAILOVER = 4;

/** Progressively-filled log dimensions, shared by invoke() and stream(). */
type Dims = {
  source: 'invoke';
  operation: string | null;
  workspace_id: string | null;
  owner_id: string | null;
  project_id: string | null;
  task_id: string | null;
  model_id: string | null;
  provider_slug: string | null;
  adapter_key: string | null;
  channel_id: string | null;
  credential_id: string | null;
  credential_label: string | null;
  request_summary: Record<string, unknown> | null;
  request_body: unknown;
};

/** One failover candidate: a (channel, credential) pair to try. */
interface Candidate {
  channel: ModelChannel;
  credential: DecryptedCredential;
  label: string | null;
}

/** Events emitted by stream() — flows InvokeService -> ChatService -> SSE -> browser. */
export type InvokeStreamEvent =
  | { type: 'meta'; request_id: string }
  | { type: 'delta'; text?: string; reasoning?: string }
  | { type: 'done'; request_id: string; latency_ms: number; response: UnifiedResponse }
  | { type: 'error'; request_id: string; code: string; message: string };

/**
 * Single entry point: validate -> route -> dispatch. invoke() is sync;
 * stream() shares the same resolution and forwards incremental deltas.
 */
@Injectable()
export class InvokeService {
  private readonly logger = new Logger(InvokeService.name);

  constructor(
    private readonly registry: RegistryService,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
    private readonly requestLog: RequestLogService,
  ) {}

  async invoke(dto: InvokeRequestDto, signal?: AbortSignal): Promise<UnifiedResponse> {
    // request id generated FIRST so even registry/validation errors carry it and get
    // logged (surfaced to the user / written onto task.error).
    const requestId = randomUUID();
    const startedAt = Date.now();
    const dims = this.newDims(dto);
    try {
      const { adapter, unified } = await this.resolveUnified(dto, dims);
      // C3 failover: try (channel × credential) candidates in order; on a RETRYABLE
      // vendor error, fall over to the next key/channel of the same provider.
      const candidates = await this.listCandidates(dto);
      const max = Math.min(candidates.length, MAX_FAILOVER);
      let lastErr: AdapterError | undefined;
      for (let i = 0; i < max; i++) {
        const { channel, credential, label } = candidates[i];
        dims.channel_id = channel.id;
        dims.credential_id = credential.id;
        dims.credential_label = label;
        try {
          const res = await adapter.invoke(unified, this.buildCtx(dto, channel, credential, signal));
          await this.credentials.markUsed(credential.id).catch(() => undefined);
          res.channel_id = channel.id;
          res.credential_id = credential.id;
          this.logSuccess(dims, requestId, startedAt, res);
          return res;
        } catch (e) {
          lastErr = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
          // Fail over on transient errors (rate-limit / vendor-down / timeout) AND on a bad
          // key — a revoked/invalid credential should try the next key, not fail fast.
          const failoverable = lastErr.retryable || lastErr.code === ERROR_CODES.CREDENTIAL_INVALID;
          if (!failoverable || i === max - 1) throw lastErr;
          this.logger.warn(
            `invoke ${dto.model_id} attempt ${i + 1}/${max} (cred ${credential.id}) failed [${lastErr.code}]; failing over`,
          );
        }
      }
      throw lastErr ?? new AdapterError({ code: ERROR_CODES.CREDENTIAL_INVALID, message: '无可用渠道/凭证' });
    } catch (e) {
      throw this.logError(dims, requestId, startedAt, e);
    }
  }

  /**
   * Streaming turn — resolves like invoke() but calls adapter.stream(). Never throws
   * out of the generator: failures surface as a final `error` event so the SSE writer
   * always closes cleanly. The request log is written on the terminal event.
   */
  async *stream(dto: InvokeRequestDto, signal?: AbortSignal): AsyncGenerator<InvokeStreamEvent> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const dims = this.newDims(dto);
    yield { type: 'meta', request_id: requestId };
    let final: UnifiedResponse | undefined;
    try {
      const { adapter, unified } = await this.resolveUnified(dto, dims);
      if (!adapter.stream) {
        throw new AdapterError({
          code: ERROR_CODES.ADAPTER_INTERNAL,
          message: `adapter ${adapter.key} does not support streaming`,
          retryable: false,
        });
      }
      // Streaming is single-attempt (no mid-stream failover): resolve the first candidate.
      const channel = await this.channels.select(dto.model_id, dto.channel_id);
      const credential = await this.credentials.select(channel.id, dto.credential_id);
      dims.channel_id = channel.id;
      dims.credential_id = credential.id;
      const ctx = this.buildCtx(dto, channel, credential, signal);
      for await (const chunk of adapter.stream({ ...unified, stream: true }, ctx)) {
        if (chunk.done) final = chunk.done;
        if (chunk.text_delta) yield { type: 'delta', text: chunk.text_delta };
        if (chunk.reasoning_delta) yield { type: 'delta', reasoning: chunk.reasoning_delta };
      }
      await this.credentials.markUsed(credential.id).catch(() => undefined);
      const response = final ?? { status: 'succeeded' as const, assets: [], text: '' };
      this.logSuccess(dims, requestId, startedAt, response);
      yield { type: 'done', request_id: requestId, latency_ms: Date.now() - startedAt, response };
    } catch (e) {
      const err = this.logError(dims, requestId, startedAt, e);
      yield { type: 'error', request_id: requestId, code: err.code, message: err.message };
    }
  }

  /** Registry lookup + param validation + build the unified request. No channel/credential
   *  (those vary per failover attempt). Mutates `dims` with provider/adapter/request facts. */
  private async resolveUnified(
    dto: InvokeRequestDto,
    dims: Dims,
  ): Promise<{ adapter: ProviderAdapter; unified: UnifiedRequest }> {
    const entry = this.registry.requireEntry(dto.model_id);
    dims.provider_slug = entry.manifest.provider_key;
    dims.adapter_key = entry.manifest.adapter_key;

    const inputs = normalizeInputsForContract(
      (dto.inputs ?? {}) as UnifiedRequest['inputs'],
      entry.manifest.input_contract,
    );
    validateInputContract(entry.manifest.input_contract, inputs);

    // The schema treats prompt/system_prompt as fields, but their VALUES arrive in
    // `inputs` (resolved by canvas-api). Validate against inputs+params merged so the
    // required `prompt` is found. validateParams only reads schema.properties, so extra
    // input keys (messages, references, ...) are ignored.
    const validationInput = { ...(inputs as Record<string, unknown>), ...(dto.params ?? {}) };
    const validation = entry.validate(validationInput);
    if (!validation.valid) {
      throw new AdapterError({
        code: ERROR_CODES.CONSTRAINT_VIOLATION,
        message: validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
        retryable: false,
      });
    }

    const adapter = this.registry.getAdapterFor(dto.model_id);
    const unified: UnifiedRequest = {
      task_type: dto.task_type as TaskType,
      model_id: dto.model_id,
      provider_model: entry.manifest.provider_model,
      params: validation.resolved_params,
      inputs,
      stream: dto.stream,
      idempotency_key: dto.idempotency_key,
    };
    dims.request_summary = summarizeRequest(unified);
    // Full context (no secrets — the key lives in ctx.credential, not here) so the
    // log detail can show what was actually sent to the model.
    dims.request_body = unified.inputs.messages ?? {
      prompt: unified.inputs.prompt ?? (unified.params as Record<string, unknown>).prompt,
      system_prompt: unified.inputs.system_prompt,
    };
    return { adapter, unified };
  }

  /** Ordered (channel × credential) failover candidates for a request. */
  private async listCandidates(dto: InvokeRequestDto): Promise<Candidate[]> {
    const channels = await this.channels.listCandidates(dto.model_id, dto.channel_id);
    const out: Candidate[] = [];
    for (const channel of channels) {
      const creds = await this.credentials.listCandidates(channel.id, dto.credential_id);
      for (const c of creds) out.push({ channel, credential: c.decrypted, label: c.label });
    }
    return out;
  }

  private buildCtx(
    dto: InvokeRequestDto,
    channel: ModelChannel,
    credential: DecryptedCredential,
    signal?: AbortSignal,
  ): InvokeCtx {
    return {
      task_id: dto.task_id,
      workspace_id: dto.workspace_id,
      project_id: dto.project_id,
      channel: { id: channel.id, key: channel.slug, base_url: channel.base_url, options: channel.request_config },
      credential,
      signal,
      downloader: this.downloader.forTask({
        workspaceId: dto.workspace_id,
        projectId: dto.project_id,
        taskId: dto.task_id,
        signal,
      }),
      logger: this.makeLogger(dto.task_id),
    };
  }

  private newDims(dto: InvokeRequestDto): Dims {
    return {
      source: 'invoke',
      operation: (dto.task_type as string) ?? null,
      workspace_id: dto.workspace_id ?? null,
      owner_id: dto.owner_id ?? null,
      project_id: dto.project_id ?? null,
      task_id: dto.task_id ?? null,
      model_id: (dto.model_id as string) ?? null,
      provider_slug: null,
      adapter_key: null,
      channel_id: null,
      credential_id: null,
      credential_label: null,
      request_summary: null,
      request_body: null,
    };
  }

  private logSuccess(dims: Dims, requestId: string, startedAt: number, res: UnifiedResponse): void {
    this.requestLog
      .record({
        ...dims,
        id: requestId,
        status: 'success',
        latency_ms: Date.now() - startedAt,
        usage: (res.usage as Record<string, unknown> | undefined) ?? null,
        response_body: { text: res.text ?? '' },
      })
      .catch((le) => this.logger.warn(`request log write failed: ${(le as Error).message}`));
  }

  private logError(dims: Dims, requestId: string, startedAt: number, e: unknown): AdapterError {
    const err = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
    // Log the full cause chain so "Cannot convert undefined or null to object" and
    // similar runtime TypeErrors carry a traceable stack to the root location.
    if (!(e instanceof AdapterError)) {
      this.logger.error(`invoke raw error [${requestId}]: ${err.message}`, (e as Error).stack);
    }
    this.requestLog
      .record({
        ...dims,
        id: requestId,
        status: 'error',
        latency_ms: Date.now() - startedAt,
        http_status: err.httpStatus ?? null,
        error_code: err.code,
        error_message: err.message,
        vendor_error: err.vendor ?? null,
      })
      .catch((le) => this.logger.warn(`request log write failed: ${(le as Error).message}`));
    (err as { request_id?: string }).request_id = requestId; // surfaced to client + task.error
    return err;
  }

  private makeLogger(taskId: string) {
    const prefix = `[task ${taskId}]`;
    return {
      debug: (m: string, meta?: Record<string, unknown>) => this.logger.debug(`${prefix} ${m}`, meta),
      info: (m: string, meta?: Record<string, unknown>) => this.logger.log(`${prefix} ${m}`, meta),
      warn: (m: string, meta?: Record<string, unknown>) => this.logger.warn(`${prefix} ${m}`, meta),
      error: (m: string, meta?: Record<string, unknown>) => this.logger.error(`${prefix} ${m}`, meta),
    };
  }
}

/** Sanitized request snapshot for the log — generation params only, never secrets. */
function summarizeRequest(req: UnifiedRequest): Record<string, unknown> {
  const p = req.params as Record<string, unknown>;
  return {
    provider_model: req.provider_model,
    task_type: req.task_type,
    stream: !!req.stream,
    temperature: p.temperature ?? null,
    max_tokens: p.max_tokens ?? null,
    thinking: p.thinking ?? null,
    json_mode: p.json_mode ?? null,
    message_count: req.inputs.messages?.length ?? null,
  };
}
