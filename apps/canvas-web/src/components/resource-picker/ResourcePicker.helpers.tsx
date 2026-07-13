import { useRef } from 'react';

import type { AssetRecord } from '../../api/asset';
import type { LibraryEntryRecord } from '../../api/library';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { kindLabel } from './ResourcePicker.utils';

export function PickerCell({
  asset,
  url,
  onPick,
}: {
  asset: AssetRecord;
  url?: string;
  onPick(): void;
}) {
  return (
    <button type="button" className="rp__cell" title={asset.name ?? asset.id} onClick={onPick}>
      {(asset.type === 'image' || asset.type === 'video') && url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="rp__cell-type">{asset.type}</span>
      )}
    </button>
  );
}

export function LibraryCell({
  entry,
  maxAssets,
  onPick,
}: {
  entry: LibraryEntryRecord;
  maxAssets?: number;
  onPick(): void;
}) {
  // Library records do not expose cover media metadata. Request the strict
  // thumbnail variant for an explicit cover only; never fall back to a sample
  // audio/video object merely to fill a grid cell.
  const url = useAssetUrl(entry.cover_asset_id, 3600, 'thumb');
  const materialCount = entry.material?.asset_ids.length ?? 0;
  const noMaterial = materialCount === 0;
  const overLimit = maxAssets !== undefined && materialCount > maxAssets;
  const disabledReason = noMaterial
    ? '没有可用于当前模型的自有素材'
    : overLimit
      ? `包含 ${materialCount} 个素材，当前最多支持 ${maxAssets} 个`
      : null;
  return (
    <button
      type="button"
      className="rp__cell rp__cell--lib"
      title={disabledReason ?? entry.name}
      disabled={disabledReason !== null}
      aria-label={disabledReason ? `${entry.name}，${disabledReason}，不可选择` : entry.name}
      onClick={onPick}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="rp__cell-type">{kindLabel(entry.kind)}</span>
      )}
      {disabledReason ? <span className="rp__cell-limit">{disabledReason}</span> : null}
      <span className="rp__cell-name">{entry.name}</span>
    </button>
  );
}

export function UploadDropzone({
  acceptMime,
  label,
  progress,
  onFiles,
}: {
  acceptMime: string;
  label: string;
  progress: number | null;
  onFiles(files: FileList | null): Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;
  return (
    <div
      className="rp__drop"
      aria-disabled={uploading}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        if (!uploading) void onFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptMime}
        className="rp__file-input"
        disabled={uploading}
        onChange={(event) => {
          const input = event.currentTarget;
          void onFiles(input.files).finally(() => {
            input.value = '';
          });
        }}
      />
      <button
        type="button"
        className="rp__upload-button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <span>上传中 {Math.round((progress ?? 0) * 100)}%</span>
        ) : (
          <span>
            点击选择或拖入{label}文件
            <em>上传后自动绑定为参考</em>
          </span>
        )}
      </button>
    </div>
  );
}
