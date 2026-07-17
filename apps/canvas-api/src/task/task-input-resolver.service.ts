import { BadRequestException, Injectable } from '@nestjs/common';
import type { GenerationReference, ResolvedGenerationReference } from '@xgcanvas/shared-types';
import { isServerOwnedLibraryProviderRef } from '@xgcanvas/shared-types';

import { AssetService } from '../asset/asset.service';
import { Task } from '../database/entities';
import { LibraryService } from '../library/library.service';
import { PresignedUrlService } from '../storage/presigned-url.service';
import { validatePublicTaskInputs } from './task-input.validator';

interface PendingResolvedReference extends ResolvedGenerationReference {
  asset_id?: string;
}

@Injectable()
export class TaskInputResolverService {
  constructor(
    private readonly assets: AssetService,
    private readonly library: LibraryService,
    private readonly urls: PresignedUrlService,
  ) {}

  async resolve(task: Task): Promise<Record<string, unknown>> {
    validatePublicTaskInputs(task.inputs ?? {});
    const inputs = { ...(task.inputs ?? {}) };
    const refs = Array.isArray(inputs.references) ? inputs.references : [];
    if (refs.length > 0) {
      const expanded: PendingResolvedReference[] = [];
      for (const ref of refs) {
        const clientRef = ref as GenerationReference;
        if (clientRef.library_entry_id) {
          expanded.push(...(await this.expandLibraryRef(task, clientRef)));
        } else {
          expanded.push(toPendingReference(clientRef));
        }
      }
      inputs.references = await Promise.all(
        expanded.map(async (ref) => {
          if (!ref.asset_id) return ref;
          const asset = await this.assets.getInWorkspaceOrThrow(
            task.owner_id,
            ref.asset_id,
            task.workspace_id,
          );
          assertReferenceAssetType(ref.type, asset.type, asset.mime_type);
          const { asset_id: _assetId, ...resolved } = ref;
          return {
            ...resolved,
            url: await this.urls.getObject(asset.storage_key, 3600),
            mime_type: asset.mime_type,
          };
        }),
      );
    }
    return inputs;
  }

  private async expandLibraryRef(
    task: Task,
    ref: GenerationReference,
  ): Promise<PendingResolvedReference[]> {
    const entry = await this.library.getInWorkspaceOrThrow(
      task.owner_id,
      ref.library_entry_id!,
      task.workspace_id,
    );
    if (entry.project_id && entry.project_id !== task.project_id) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `库条目「${entry.name}」不属于当前任务项目`,
      });
    }
    const readyProviderRefs = (entry.provider_refs ?? []).filter(
      (providerRef) =>
        isServerOwnedLibraryProviderRef(providerRef) && providerRef.status === 'ready',
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
    const type = ref.type !== 'library_ref' ? ref.type : mediaTypeOfKind(entry.kind);
    if (materialIds.length > 0) {
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
  return kind === 'voice' ? 'audio' : 'image';
}

function assertReferenceAssetType(
  referenceType: ResolvedGenerationReference['type'],
  assetType: string,
  mimeType: string,
): void {
  const expected = referenceAssetType(referenceType);
  const normalizedMime = mimeType.toLowerCase();
  if (
    !expected ||
    (assetType === expected.assetType &&
      (expected.mimePrefix
        ? normalizedMime.startsWith(expected.mimePrefix)
        : normalizedMime.includes('json')))
  )
    return;
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: `reference type ${referenceType} expects ${expected.assetType}, got ${assetType} (${mimeType})`,
  });
}

function referenceAssetType(
  type: ResolvedGenerationReference['type'],
): { assetType: string; mimePrefix: string | null } | null {
  if (type === 'video') return { assetType: 'video', mimePrefix: 'video/' };
  if (type === 'audio') return { assetType: 'audio', mimePrefix: 'audio/' };
  if (type === 'json') return { assetType: 'json', mimePrefix: null };
  if (
    type === 'image' ||
    type === 'image_list' ||
    type === 'mask' ||
    type === 'style_token' ||
    type === 'entity_ref'
  )
    return { assetType: 'image', mimePrefix: 'image/' };
  return null;
}
