import type { AssetRecord } from '../../api/asset';
import type { LibraryEntryRecord } from '../../api/library';
import { LibraryCell, PickerCell } from './ResourcePicker.helpers';

interface AssetResultsProps {
  loading: boolean;
  loadError: string | null;
  rows: AssetRecord[];
  previewUrls: Record<string, string>;
  emptyLabel: string;
  onPick(asset: AssetRecord): void;
}

export function AssetResults({
  loading,
  loadError,
  rows,
  previewUrls,
  emptyLabel,
  onPick,
}: AssetResultsProps) {
  return (
    <div className="rp__grid">
      {loading ? (
        <div className="rp__empty">加载中…</div>
      ) : loadError ? (
        <div className="rp__empty" role="alert">
          {loadError}
        </div>
      ) : rows.length === 0 ? (
        <div className="rp__empty">暂无{emptyLabel}资产</div>
      ) : (
        rows.map((asset) => (
          <PickerCell
            key={asset.id}
            asset={asset}
            url={previewUrls[asset.id]}
            onPick={() => onPick(asset)}
          />
        ))
      )}
    </div>
  );
}

interface LibraryResultsProps {
  loading: boolean;
  loadError: string | null;
  rows: LibraryEntryRecord[];
  maxAssets?: number;
  onPick(entry: LibraryEntryRecord): void;
}

export function LibraryResults({
  loading,
  loadError,
  rows,
  maxAssets,
  onPick,
}: LibraryResultsProps) {
  return (
    <div className="rp__grid">
      {loading ? (
        <div className="rp__empty">加载中…</div>
      ) : loadError ? (
        <div className="rp__empty" role="alert">
          {loadError}
        </div>
      ) : rows.length === 0 ? (
        <div className="rp__empty">库中暂无条目</div>
      ) : (
        rows.map((entry) => (
          <LibraryCell
            key={entry.id}
            entry={entry}
            maxAssets={maxAssets}
            onPick={() => onPick(entry)}
          />
        ))
      )}
    </div>
  );
}
