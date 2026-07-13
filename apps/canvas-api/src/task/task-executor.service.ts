import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import type {
  GenerationReference,
  ResolvedGenerationReference,
  TaskType,
} from '@xgcanvas/shared-types';
import { isServerOwnedLibraryProviderRef } from '@xgcanvas/shared-types';

import { AccountInvokeClient } from '../account-client';
import { AssetService } from '../asset/asset.service';
import { Task } from '../database/entities';
import { LibraryService } from '../library/library.service';
import { PresignedUrlService } from '../storage/presigned-url.service';
import { decideRetry } from './retry-policy';
import { validatePublicTaskInputs } from './task-input.validator';
import { type ClaimedTask, TaskService } from './task.service';
import { TaskTerminalService } from './task-terminal.service';

interface PendingResolvedReference extends ResolvedGenerationReference {
  asset_id?: string;
}

@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    private readonly tasks: TaskService,
    private readonly invoke: AccountInvokeClient,
    private readonly assets: AssetService,
    private readonly library: LibraryService,
    private readonly urls: PresignedUrlService,
    private readonly terminal: TaskTerminalService,
  ) {}

  /** Dispatch a leased task. Every persisted change is guarded by its token. */
  async run(claimed: ClaimedTask, signal?: AbortSignal): Promise<void> {
    const t = await this.tasks.startClaimed(claimed);
    if (!t) return;

    try {
      const res = await this.invoke.invoke({
        task_id: t.id,
        task_type: t.type as TaskType,
        model_id: t.model_id,
        workspace_id: t.workspace_id,
        owner_id: t.owner_id,
        project_id: t.project_id ?? undefined,
        params: t.params,
        inputs: await this.resolveInputs(t),
        idempotency_key: `task:${t.id}:attempt:${t.attempt_no}`,
      }, signal);
      if (res.status === 'running') {
        await this.handleRunning(t, res.external_task_id, res.channel_id, res.credential_id, res.next_poll_after_ms);
        return;
      }
      if (res.status === 'succeeded') {
        await this.terminal.succeed(t.id, t.lease_token, {
          assets: res.assets,
          text: res.text,
          json: res.json,
          channel_id: res.channel_id,
          credential_id: res.credential_id,
        });
        return;
      }
      await this.handleFailed(
        t,
        res.error?.code ?? 'VENDOR_REJECTED',
        res.error?.message ?? 'vendor failed',
      );
    } catch (e) {
      const { code, message: baseMsg, requestId } = taskError(e);
      const msg = requestId ? `${baseMsg}（请求 ID: ${requestId}）` : baseMsg;
      this.logger.warn(`task ${t.id} invoke failed: ${code} ${msg}`);
      await this.handleFailed(t, code, msg);
    }
  }

  private async handleRunning(
    t: ClaimedTask,
    externalId: string | undefined,
    channelId?: string,
    credentialId?: string,
    after?: number,
  ): Promise<void> {
    if (!externalId) {
      await this.handleFailed(t, 'VENDOR_REJECTED', 'no external_task_id from adapter');
      return;
    }
    const saved = await this.tasks.saveExternalResult(t.id, t.lease_token, {
      external_task_id: externalId,
      channel_id: channelId,
      credential_id: credentialId,
      next_poll_at: new Date(Date.now() + (after ?? 2000)),
    });
    if (!saved && channelId && credentialId) {
      // Cancellation may have won while invoke was in flight. Stop the newly
      // created vendor job rather than leaving it billable in the background.
      await this.invoke.cancel({
        external_task_id: externalId,
        model_id: t.model_id,
        channel_id: channelId,
        credential_id: credentialId,
      }).catch(() => undefined);
    }
  }

  private async handleFailed(t: ClaimedTask, code: string, message: string): Promise<void> {
    const decision = decideRetry(code, t.retry_count);
    if (decision.retry) {
      await this.tasks.scheduleRetry(
        t.id,
        t.lease_token,
        code,
        message,
        new Date(Date.now() + decision.delay_ms),
      );
      return;
    }
    await this.terminal.fail(t.id, t.lease_token, code, message);
  }

  private async resolveInputs(t: Task): Promise<Record<string, unknown>> {
    // Defense in depth for tasks created before the public DTO boundary was
    // hardened. A persisted raw URL must never be promoted to a trusted ref.
    validatePublicTaskInputs(t.inputs ?? {});
    const inputs = { ...(t.inputs ?? {}) };
    const refs = Array.isArray(inputs.references) ? inputs.references : [];
    if (refs.length > 0) {
      // 1) Expand library references into concrete material refs + provider
      //    metadata; 2) resolve asset ids into presigned URLs. Loading the
      //    entry / asset via getOrThrow is also the permission check.
      const expanded: PendingResolvedReference[] = [];
      for (const ref of refs) {
        const clientRef = ref as GenerationReference;
        if (clientRef.library_entry_id) {
          expanded.push(...(await this.expandLibraryRef(t, clientRef)));
        } else {
          expanded.push(toPendingReference(clientRef));
        }
      }
      inputs.references = await Promise.all(
        expanded.map(async (ref) => {
          if (!ref.asset_id) return ref;
          const asset = await this.assets.getInWorkspaceOrThrow(t.owner_id, ref.asset_id, t.workspace_id);
          const { asset_id: _assetId, ...resolved } = ref;
          return {
            ...resolved,
            url: await this.urls.getObject(asset.storage_key, 3600),
            mime_type: asset.mime_type,
          };
        }),
      );
    }
    if (typeof inputs.audio_url === 'string' && inputs.audio_url) {
      const asset = await this.assets.getInWorkspaceOrThrow(t.owner_id, inputs.audio_url, t.workspace_id);
      inputs.audio_url = await this.urls.getObject(asset.storage_key, 3600);
    }
    return inputs;
  }

  /**
   * Normalize a library reference into the adapter-facing shape: each material
   * asset becomes a plain reference (later resolved to a presigned URL), and
   * the entry's provider_refs travel in metadata.library so a same-vendor
   * adapter can inject the native resource id instead.
   */
  private async expandLibraryRef(t: Task, ref: GenerationReference): Promise<PendingResolvedReference[]> {
    const entry = await this.library.getInWorkspaceOrThrow(t.owner_id, ref.library_entry_id!, t.workspace_id);
    if (entry.project_id && entry.project_id !== t.project_id) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `库条目「${entry.name}」不属于当前任务项目`,
      });
    }
    const readyProviderRefs = (entry.provider_refs ?? []).filter(
      (providerRef) => isServerOwnedLibraryProviderRef(providerRef) && providerRef.status === 'ready',
    );
    const metadata = {
      library: {
        entry_id: entry.id,
        kind: entry.kind,
        name: entry.name,
        provider_refs: readyProviderRefs,
      },
    };
    const materialIds = entry.material?.asset_ids ?? [];
    if (materialIds.length > 0) {
      const type = ref.type && ref.type !== 'library_ref' ? ref.type : mediaTypeOfKind(entry.kind);
      return materialIds.map((assetId, index) => ({
        slot: ref.slot,
        type,
        asset_id: assetId,
        weight: ref.weight,
        metadata,
        order: ref.order !== undefined ? ref.order + index : undefined,
      }));
    }
    if (readyProviderRefs.length > 0) {
      // Vendor-only entry: no bytes on our side; the adapter must consume
      // metadata.library.provider_refs natively.
      const type = ref.type && ref.type !== 'library_ref' ? ref.type : mediaTypeOfKind(entry.kind);
      return [{ slot: ref.slot, type, weight: ref.weight, order: ref.order, metadata }];
    }
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: `库条目「${entry.name}」既没有素材也没有已验证的厂商绑定，无法用于生成`,
    });
  }
}

function toPendingReference(ref: GenerationReference): PendingResolvedReference {
  return {
    slot: ref.slot,
    type: ref.type,
    asset_id: ref.asset_id,
    weight: ref.weight,
    order: ref.order,
  };
}

function mediaTypeOfKind(kind: string): GenerationReference['type'] {
  if (kind === 'voice') return 'audio';
  return 'image';
}

function taskError(error: unknown): { code: string; message: string; requestId?: string } {
  const requestId = (error as { request_id?: string } | null)?.request_id;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const body = typeof response === 'object' && response !== null
      ? response as { code?: string; message?: string | string[] }
      : undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : body?.message ?? (typeof response === 'string' ? response : error.message);
    const statusCode = error.getStatus();
    const code = body?.code
      ?? (statusCode === 400 ? 'VALIDATION_FAILED'
        : statusCode === 403 ? 'FORBIDDEN'
          : statusCode === 404 ? 'NOT_FOUND'
            : 'INTERNAL_ERROR');
    return { code, message, requestId };
  }
  return {
    code: (error as { code?: string } | null)?.code ?? 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    requestId,
  };
}
