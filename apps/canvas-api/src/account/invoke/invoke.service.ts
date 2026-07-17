import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  AdapterError,
  type DecryptedCredential,
  type InvokeCtx,
  type UnifiedResponse,
  wrapUnknownVendorError,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';
import { redactSecretLikeValues, redactSecretText } from '@xgcanvas/model-catalog';

import { AssetDownloaderService } from '../storage';
import { AdapterRegistry } from '../adapters/registry';
import { RegistryService } from '../registry';
import type { ModelRegistryEntry, RegistrySnapshot } from '../registry/types';
import {
  ChannelResolverService,
  snapshotChannelRoute,
  type ResolvedChannel,
} from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { InvokeRequestDto } from './dto/invoke-request.dto';
import { newInvokeLogDimensions } from './invoke-log-context';
import { InvokeAttemptLogService } from './invoke-attempt-log.service';
import { resolveInvokeRequest, toChannelModelSelection } from './invoke-request-resolution';

/** Max (channel × credential) attempts per invoke before giving up (C3 failover). */
const MAX_FAILOVER = 4;

/** One failover candidate: a (channel, credential) pair to try. */
interface Candidate {
  channel: ResolvedChannel;
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
    private readonly adapters: AdapterRegistry,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
    private readonly attemptLogs: InvokeAttemptLogService,
  ) {}

  async invoke(dto: InvokeRequestDto, signal?: AbortSignal): Promise<UnifiedResponse> {
    // request id generated FIRST so even registry/validation errors carry it and get
    // logged (surfaced to the user / written onto task.error).
    const callerLogicalRequestId = dto.logical_request_id;
    const logicalRequestId = callerLogicalRequestId ?? randomUUID();
    const preflightRequestId = callerLogicalRequestId ? randomUUID() : logicalRequestId;
    const startedAt = Date.now();
    const dims = newInvokeLogDimensions(dto);
    try {
      const snapshot = this.registry.getSnapshot();
      const { unified, entry, historical } = resolveInvokeRequest(
        this.registry,
        dto,
        dims,
        snapshot,
      );
      const adapter = this.adapters.get(entry.manifest.adapter_key);
      // C3 failover: try (channel × credential) candidates in order; on a RETRYABLE
      // vendor error, fall over to the next key/channel of the same provider.
      const candidates = await this.listCandidates(dto, entry, historical, snapshot);
      const max = Math.min(candidates.length, MAX_FAILOVER);
      const firstAttemptNo = await this.attemptLogs.nextAttemptNo(logicalRequestId);
      let lastErr: AdapterError | undefined;
      for (let i = 0; i < max; i++) {
        const { channel, credential, label } = candidates[i];
        const requestId =
          !callerLogicalRequestId && firstAttemptNo === 1 && i === 0
            ? logicalRequestId
            : randomUUID();
        dims.channel_resource_uid = channel.resource_uid;
        dims.channel_revision_id = channel.revision_id;
        dims.channel_route = snapshotChannelRoute(channel);
        dims.credential_id = credential.id;
        dims.credential_label = label;
        const attemptStartedAt = Date.now();
        try {
          await this.attemptLogs.begin(requestId, logicalRequestId, firstAttemptNo + i, dims);
        } catch (error) {
          throw ledgerError(requestId, 'failed to persist vendor attempt before dispatch', error);
        }
        const ctx = this.buildCtx(dto, channel, credential, signal);
        let res: UnifiedResponse;
        try {
          res = await adapter.invoke(unified, ctx);
        } catch (e) {
          lastErr = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
          if (lastErr.accepted_result) {
            await this.credentials.markUsed(credential.id).catch(() => undefined);
            await this.attemptLogs
              .finishAcceptedResultFailure(requestId, attemptStartedAt, lastErr)
              .catch((logError) => {
                throw ledgerError(
                  requestId,
                  'vendor completed but its accepted result could not be persisted',
                  logError,
                  'accepted',
                );
              });
            (lastErr as { request_id?: string }).request_id = requestId;
            throw lastErr;
          }
          if (lastErr.dispatch_outcome !== 'definitely_rejected') {
            try {
              await this.attemptLogs.markOutcomeUnknown(requestId, attemptStartedAt, lastErr);
            } catch (logError) {
              throw ledgerError(
                requestId,
                'failed to persist an unknown vendor dispatch outcome',
                logError,
                'outcome_unknown',
              );
            }
            (lastErr as { request_id?: string }).request_id = requestId;
            throw lastErr;
          }
          try {
            await this.attemptLogs.fail(requestId, attemptStartedAt, lastErr);
          } catch (logError) {
            throw ledgerError(requestId, 'failed to persist vendor attempt failure', logError);
          }
          // Fail over on transient errors (rate-limit / vendor-down / timeout) AND on a bad
          // key — a revoked/invalid credential should try the next key, not fail fast.
          const failoverable = lastErr.retryable || lastErr.code === ERROR_CODES.CREDENTIAL_INVALID;
          if (!failoverable || i === max - 1) {
            (lastErr as { request_id?: string }).request_id = requestId;
            throw lastErr;
          }
          this.logger.warn(
            `invoke ${dto.model_id} attempt ${i + 1}/${max} (cred ${credential.id}) failed [${lastErr.code}]; failing over`,
          );
          continue;
        }

        await this.credentials.markUsed(credential.id).catch(() => undefined);
        res.request_id = requestId;
        res.channel_resource_uid = channel.resource_uid;
        res.channel_revision_id = channel.revision_id;
        res.channel_route = snapshotChannelRoute(channel);
        res.credential_id = credential.id;
        try {
          await this.attemptLogs.finish(requestId, attemptStartedAt, unified, res);
        } catch (logError) {
          if (res.status === 'running' && res.external_task_id && adapter.cancel) {
            await adapter.cancel(res.external_task_id, ctx).catch(() => undefined);
          }
          throw ledgerError(
            requestId,
            'vendor responded but its result could not be persisted',
            logError,
            'accepted',
          );
        }
        return res;
      }
      throw (
        lastErr ??
        new AdapterError({ code: ERROR_CODES.CREDENTIAL_INVALID, message: '无可用渠道/凭证' })
      );
    } catch (e) {
      const err = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
      if (!(e instanceof AdapterError)) {
        this.logger.error(
          `invoke raw error [${logicalRequestId}]: ${redactSecretText(err.message)}`,
        );
      }
      if (!(err as { request_id?: string }).request_id) {
        await this.attemptLogs.recordPreflightFailure(
          preflightRequestId,
          logicalRequestId,
          dims,
          startedAt,
          err,
        );
        (err as { request_id?: string }).request_id = preflightRequestId;
      }
      throw err;
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
    const dims = newInvokeLogDimensions(dto);
    yield { type: 'meta', request_id: requestId };
    let final: UnifiedResponse | undefined;
    let attemptOpen = false;
    try {
      const snapshot = this.registry.getSnapshot();
      const { unified, entry, historical } = resolveInvokeRequest(
        this.registry,
        dto,
        dims,
        snapshot,
      );
      const adapter = this.adapters.get(entry.manifest.adapter_key);
      if (!adapter.stream) {
        throw new AdapterError({
          code: ERROR_CODES.ADAPTER_INTERNAL,
          message: `adapter ${adapter.key} does not support streaming`,
          retryable: false,
        });
      }
      // Streaming is single-attempt (no mid-stream failover): resolve the first candidate.
      const channel = await this.channels.select(
        toChannelModelSelection(entry, historical),
        dto.channel_resource_uid,
        snapshot,
      );
      const credential = await this.credentials.select(channel.resource_uid, dto.credential_id);
      dims.channel_resource_uid = channel.resource_uid;
      dims.channel_revision_id = channel.revision_id;
      dims.channel_route = snapshotChannelRoute(channel);
      dims.credential_id = credential.id;
      await this.attemptLogs.begin(requestId, requestId, 1, dims);
      attemptOpen = true;
      const ctx = this.buildCtx(dto, channel, credential, signal);
      for await (const chunk of adapter.stream({ ...unified, stream: true }, ctx)) {
        if (chunk.done) final = chunk.done;
        if (chunk.text_delta) yield { type: 'delta', text: chunk.text_delta };
        if (chunk.reasoning_delta) yield { type: 'delta', reasoning: chunk.reasoning_delta };
      }
      await this.credentials.markUsed(credential.id).catch(() => undefined);
      const response = final ?? { status: 'succeeded' as const, assets: [], text: '' };
      response.request_id = requestId;
      response.channel_resource_uid = channel.resource_uid;
      response.channel_revision_id = channel.revision_id;
      response.channel_route = snapshotChannelRoute(channel);
      response.credential_id = credential.id;
      await this.attemptLogs.finish(requestId, startedAt, unified, response);
      attemptOpen = false;
      yield { type: 'done', request_id: requestId, latency_ms: Date.now() - startedAt, response };
    } catch (e) {
      const err = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
      if (attemptOpen) {
        const persist =
          err.dispatch_outcome === 'definitely_rejected'
            ? this.attemptLogs.fail(requestId, startedAt, err)
            : this.attemptLogs.markOutcomeUnknown(requestId, startedAt, err);
        await persist.catch((logError) => {
          this.logger.error(`stream request log update failed: ${(logError as Error).message}`);
        });
      } else {
        await this.attemptLogs.recordPreflightFailure(requestId, requestId, dims, startedAt, err);
      }
      (err as { request_id?: string }).request_id = requestId;
      yield {
        type: 'error',
        request_id: requestId,
        code: err.code,
        message: redactSecretText(err.message),
      };
    }
  }

  /** Ordered (channel × credential) failover candidates for a request. */
  private async listCandidates(
    dto: InvokeRequestDto,
    entry: ModelRegistryEntry,
    historical: boolean,
    snapshot: RegistrySnapshot,
  ): Promise<Candidate[]> {
    const channels = await this.channels.listCandidates(
      toChannelModelSelection(entry, historical),
      dto.channel_resource_uid,
      snapshot,
    );
    const out: Candidate[] = [];
    for (const channel of channels) {
      const creds = await this.credentials.listCandidates(channel.resource_uid, dto.credential_id);
      for (const c of creds) out.push({ channel, credential: c.decrypted, label: c.label });
    }
    return out;
  }

  private buildCtx(
    dto: InvokeRequestDto,
    channel: ResolvedChannel,
    credential: DecryptedCredential,
    signal?: AbortSignal,
  ): InvokeCtx {
    return {
      task_id: dto.task_id,
      workspace_id: dto.workspace_id,
      project_id: dto.project_id,
      channel: {
        resource_uid: channel.resource_uid,
        key: channel.slug,
        base_url: channel.base_url,
        options: channel.request_config,
      },
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

  private makeLogger(taskId: string) {
    const prefix = `[task ${taskId}]`;
    return {
      debug: (m: string, meta?: Record<string, unknown>) =>
        this.logger.debug(`${prefix} ${redactSecretText(m)}`, redactSecretLikeValues(meta)),
      info: (m: string, meta?: Record<string, unknown>) =>
        this.logger.log(`${prefix} ${redactSecretText(m)}`, redactSecretLikeValues(meta)),
      warn: (m: string, meta?: Record<string, unknown>) =>
        this.logger.warn(`${prefix} ${redactSecretText(m)}`, redactSecretLikeValues(meta)),
      error: (m: string, meta?: Record<string, unknown>) =>
        this.logger.error(`${prefix} ${redactSecretText(m)}`, redactSecretLikeValues(meta)),
    };
  }
}

function ledgerError(
  requestId: string,
  message: string,
  cause: unknown,
  dispatchOutcome: 'definitely_rejected' | 'outcome_unknown' | 'accepted' = 'definitely_rejected',
): AdapterError {
  const error = new AdapterError({
    code: ERROR_CODES.ADAPTER_INTERNAL,
    message,
    retryable: false,
    dispatch_outcome: dispatchOutcome,
    vendor: { cause: cause instanceof Error ? cause.message : String(cause) },
  });
  (error as { request_id?: string }).request_id = requestId;
  return error;
}
