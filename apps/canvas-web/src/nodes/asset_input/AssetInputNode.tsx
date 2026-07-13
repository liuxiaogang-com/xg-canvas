import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { type NodeProps } from '@xyflow/react';
import { NodeShell } from '@xgcanvas/ui-kit';

import { LazyVideoPlayer } from '../../components/media-player';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { assetTypeOf, uploadAsset } from '../../lib/upload-asset';
import { toast } from '../../ui';
import { useCanvasStore } from '../../canvas/canvas-state';
import { scheduleNodeUpdate } from '../../canvas/sync/auto-save';
import { useCanvasUI } from '../../canvas/ui-state';
import NodePorts from '../_shared/NodePorts';
import WidthResizer from '../_shared/WidthResizer';
import { aspectFromSize } from '../_shared/aspect';
import { renameNode } from '../_shared/rename';
import { NodeIcon } from '../node-icons';
import { toShellStatus, type CanvasNodeData } from '../types';
import { assetInputSchema, titleForMedia, type AssetInputData, type AssetMediaType } from './schema';

const ACCEPT = 'image/*,video/*,audio/*';

export default function AssetInputNode({ id, selected, data }: NodeProps) {
  const d = data as AssetInputData & CanvasNodeData & { width?: number };
  const status = d.status ?? 'idle';
  const hasAsset = !!d.output_asset_id;
  const url = useAssetUrl(d.media_type === 'video' ? null : d.output_asset_id ?? null);
  const canEdit = useCanvasUI((s) => s.canEdit);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = status === 'pending' || progress !== null;

  const applyFile = useCallback(
    async (file: File) => {
      const media = assetTypeOf(file.type);
      if (media !== 'image' && media !== 'video' && media !== 'audio') {
        toast.error('仅支持图片、视频或音频文件');
        return;
      }
      const projectId = useCanvasStore.getState().projectId;
      if (!projectId) return;

      useCanvasStore.getState().patchNodeData(id, { status: 'pending' });
      setProgress(0);
      try {
        const asset = await uploadAsset(file, {
          project_id: projectId,
          onProgress: (f) => setProgress(f),
        });
        const typedTitle = titleForMedia(media as AssetMediaType);
        // Keep a user rename unless the title is still a generic/type default.
        const prevTitle = typeof d.title === 'string' ? d.title : '';
        const keepTitle =
          prevTitle &&
          prevTitle !== assetInputSchema.title &&
          prevTitle !== titleForMedia('image') &&
          prevTitle !== titleForMedia('video') &&
          prevTitle !== titleForMedia('audio');
        const patch: Partial<AssetInputData & CanvasNodeData> = {
          media_type: media as AssetMediaType,
          output_asset_id: asset.id,
          asset_name: asset.name ?? file.name,
          media_width: asset.width ?? undefined,
          media_height: asset.height ?? undefined,
          duration_ms: asset.duration_ms ?? undefined,
          title: keepTitle ? prevTitle : typedTitle,
          status: 'idle',
        };
        useCanvasStore.getState().patchNodeData(id, patch);
        const node = useCanvasStore.getState().nodes.find((n) => n.id === id);
        scheduleNodeUpdate(projectId, id, {
          data: { ...(node?.data as Record<string, unknown>), ...patch, status: undefined },
        });
      } catch (e) {
        useCanvasStore.getState().patchNodeData(id, { status: 'idle' });
        toast.error((e as Error).message || '上传失败');
      } finally {
        setProgress(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [id, d.title],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void applyFile(file);
  };

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void applyFile(file);
  };

  const displayTitle = d.title ?? titleForMedia(d.media_type);
  const meta = d.asset_name || (d.media_type ? d.media_type : '未上传');
  const mediaAspect =
    d.media_type === 'audio'
      ? '3 / 1'
      : aspectFromSize(d.media_width, d.media_height) ?? '16 / 10';

  return (
    <NodeShell
      width={typeof d.width === 'number' && d.width > 80 ? d.width : 260}
      title={displayTitle}
      icon={<NodeIcon type="asset_input" />}
      onTitleChange={(t) => renameNode(id, t)}
      meta={meta}
      status={toShellStatus(uploading ? 'pending' : status)}
      statusLabel={uploading ? `上传中 ${progress != null ? Math.round(progress * 100) : ''}`.trim() : status === 'idle' ? '素材' : status}
      selected={!!selected}
      ports={
        <>
          <WidthResizer id={id} visible={!!selected} />
          <NodePorts />
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="nodrag"
        style={{ display: 'none' }}
        onChange={onPick}
        disabled={!canEdit || uploading}
      />
      {d.media_type === 'video' && d.output_asset_id ? (
        <LazyVideoPlayer
          assetId={d.output_asset_id}
          playerId={`node:${id}`}
          aspectRatio={mediaAspect}
          objectFit="contain"
        />
      ) : (
        <div
          style={{ aspectRatio: mediaAspect, minHeight: 72, overflow: 'hidden' }}
          onDragOver={(e) => {
            // Only claim the gesture when OS files are being dropped (replace media).
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={onDrop}
        >
          {url && d.media_type === 'image' ? (
            <img
              src={url}
              alt={d.asset_name ?? ''}
              draggable={false}
              className="w-full h-full object-cover"
            />
          ) : url && d.media_type === 'audio' ? (
            <div className="nodrag w-full h-full flex items-center justify-center p-3">
              <audio src={url} controls className="w-full" />
            </div>
          ) : uploading ? (
            <div
              className="w-full h-full flex items-center justify-center text-[11px]"
              style={{ color: 'var(--c-text-on-dark-3)' }}
            >
              上传中{progress != null ? ` ${Math.round(progress * 100)}%` : '…'}
            </div>
          ) : (
            <button
              type="button"
              className="nodrag node-ph w-full h-full flex flex-col items-center justify-center gap-1 text-[11px] cursor-pointer border-0 bg-transparent"
              style={{ color: 'var(--c-text-on-dark-3)' }}
              disabled={!canEdit}
              onClick={() => canEdit && inputRef.current?.click()}
            >
              <span>点击或拖入文件</span>
              <span style={{ opacity: 0.7 }}>图片 / 视频 / 音频</span>
            </button>
          )}
        </div>
      )}
      {hasAsset && canEdit && !uploading ? (
        <button
          type="button"
          className="nodrag w-full text-[10px] py-1 border-0 cursor-pointer"
          style={{
            background: 'var(--c-canvas-panel-2, transparent)',
            color: 'var(--c-text-on-dark-3)',
            borderTop: '1px solid var(--c-canvas-border-soft)',
          }}
          onClick={() => inputRef.current?.click()}
        >
          替换素材
        </button>
      ) : null}
    </NodeShell>
  );
}
