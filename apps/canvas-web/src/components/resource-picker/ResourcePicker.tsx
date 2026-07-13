import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { assetApi, type AssetRecord } from '../../api/asset';
import { libraryApi, type LibraryEntryRecord } from '../../api/library';
import { assetTypeOf, uploadAsset } from '../../lib/upload-asset';
import { Segmented, toast } from '../../ui';
import { UploadDropzone } from './ResourcePicker.helpers';
import { AssetResults, LibraryResults } from './ResourcePicker.sections';
import {
  computePanelPos,
  errorMessage,
  mergeLibraryRows,
  type PanelPos,
  useDebouncedValue,
  usePopoverFocus,
} from './ResourcePicker.utils';
import './ResourcePicker.css';

export type PickerAccept = 'image' | 'video' | 'audio';

interface Props {
  open: boolean;
  onClose(): void;
  /** Media kind this slot accepts; drives both list filter and upload accept. */
  accept: PickerAccept;
  projectId?: string;
  onSelect(asset: AssetRecord): void;
  /** When set, shows the 从库选择 tab filtered to these library kinds. */
  libraryKinds?: string[];
  /** Maximum material assets the receiving model slot accepts. */
  libraryMaxAssets?: number;
  onSelectLibrary?(entry: LibraryEntryRecord): void;
  /** Trigger element used to anchor the floating panel (portal to body). */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Alternate focus target when the trigger becomes disabled after selection. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type Tab = 'pick' | 'library' | 'upload';
type Scope = 'project' | 'mine' | 'workspace' | 'favorites';

const ACCEPT_MIME: Record<PickerAccept, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

/**
 * Unified resource picker: choose an existing asset or upload a new one.
 * Selection always yields a full AssetRecord so callers can bind asset_id and
 * show a preview immediately. Rendered via portal as a fixed floating panel
 * anchored to `anchorRef` (prefer above; flip below when space is tight).
 */
export default function ResourcePicker({
  open,
  onClose,
  accept,
  projectId,
  onSelect,
  libraryKinds,
  libraryMaxAssets,
  onSelectLibrary,
  anchorRef,
  returnFocusRef,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('pick');
  const [scope, setScope] = useState<Scope>(projectId ? 'project' : 'mine');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AssetRecord[]>([]);
  const [libRows, setLibRows] = useState<LibraryEntryRecord[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const hasLibrary = !!libraryKinds?.length && !!onSelectLibrary;
  const debouncedQuery = useDebouncedValue(query, 250);
  const libraryKindsKey = libraryKinds?.join(',') ?? '';
  usePopoverFocus(open, ref, anchorRef, returnFocusRef);

  useEffect(() => {
    if (!hasLibrary && tab === 'library') setTab('pick');
  }, [hasLibrary, tab]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const next = computePanelPos(anchorRef?.current, ref.current);
      if (next) setPos(next);
    };
    update();
    // Re-measure after first paint when panel height is known.
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    // Capture scroll from any ancestor (canvas transform / app-shell overflow).
    document.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, tab, rows.length, libRows.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open || tab !== 'pick') return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const params: Parameters<typeof assetApi.list>[0] = { type: accept, limit: 60 };
    if (scope === 'project' && projectId) params.project_id = projectId;
    if (scope === 'workspace') params.project_id = 'global';
    if (scope === 'mine') params.owner = 'me';
    if (scope === 'favorites') params.favorited = true;
    if (debouncedQuery.trim()) params.q = debouncedQuery.trim();
    assetApi
      .list(params)
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRows([]);
          setLoadError(errorMessage(error, '资产加载失败'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, scope, debouncedQuery, accept, projectId]);

  useEffect(() => {
    if (!open || tab !== 'library' || !hasLibrary) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const kinds = libraryKindsKey.split(',').filter(Boolean);
    const scopes: Array<string | 'global'> = projectId ? [projectId, 'global'] : ['global'];
    Promise.all(
      kinds.flatMap((kind) =>
        scopes.map((projectScope) =>
          libraryApi.list({
            kind,
            project_id: projectScope,
            q: debouncedQuery.trim() || undefined,
            limit: 40,
          }),
        ),
      ),
    )
      .then((lists) => {
        if (!cancelled) setLibRows(mergeLibraryRows(lists.flat()));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLibRows([]);
          setLoadError(errorMessage(error, '资源库加载失败'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, debouncedQuery, hasLibrary, libraryKindsKey, projectId]);

  useEffect(() => {
    if (!open || tab !== 'pick') {
      setPreviewUrls({});
      return;
    }
    // The batch endpoint falls back to the full object when no thumbnail is
    // present. Only include videos that already have a thumbnail so opening a
    // picker grid can never download full video files.
    const ids = rows
      .filter(
        (asset) => asset.type === 'image' || (asset.type === 'video' && !!asset.thumb_storage_key),
      )
      .map((asset) => asset.id);
    if (ids.length === 0) {
      setPreviewUrls({});
      return;
    }
    let cancelled = false;
    assetApi
      .batchUrls(ids)
      .then((result) => {
        if (!cancelled) setPreviewUrls(result.urls);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrls({});
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, rows]);

  if (!open) return null;

  const scopeOptions = [
    ...(projectId ? [{ value: 'project' as const, label: '项目' }] : []),
    { value: 'mine' as const, label: '我的' },
    { value: 'workspace' as const, label: '工作区' },
    { value: 'favorites' as const, label: '收藏' },
  ];

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || progress !== null) return;
    if (assetTypeOf(file.type) !== accept) {
      toast.error(`请选择${labelOf(accept)}文件`);
      return;
    }
    setProgress(0);
    try {
      const asset = await uploadAsset(file, {
        project_id: projectId,
        onProgress: (f) => setProgress(f),
      });
      onSelect(asset);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, '上传失败'));
    } finally {
      setProgress(null);
    }
  };

  const panel = (
    <div
      className="rp"
      ref={ref}
      role="dialog"
      aria-label="资源选择器"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      <div className="rp__head">
        <Segmented<Tab>
          value={tab}
          options={[
            { value: 'pick', label: '选择资产' },
            ...(hasLibrary ? [{ value: 'library' as const, label: '从库选择' }] : []),
            { value: 'upload', label: '上传' },
          ]}
          onChange={setTab}
        />
        <button type="button" className="rp__close" aria-label="关闭" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {tab === 'pick' ? (
        <>
          <div className="rp__filters">
            <Segmented<Scope> value={scope} options={scopeOptions} onChange={setScope} />
            <input
              className="input rp__search"
              value={query}
              placeholder="搜索名称"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <AssetResults
            loading={loading}
            loadError={loadError}
            rows={rows}
            previewUrls={previewUrls}
            emptyLabel={labelOf(accept)}
            onPick={(asset) => {
              onSelect(asset);
              onClose();
            }}
          />
        </>
      ) : tab === 'library' ? (
        <>
          <input
            className="input rp__search"
            value={query}
            placeholder="搜索库条目"
            onChange={(e) => setQuery(e.target.value)}
          />
          <LibraryResults
            loading={loading}
            loadError={loadError}
            rows={libRows}
            maxAssets={libraryMaxAssets}
            onPick={(entry) => {
              onSelectLibrary?.(entry);
              onClose();
            }}
          />
        </>
      ) : (
        <UploadDropzone
          acceptMime={ACCEPT_MIME[accept]}
          label={labelOf(accept)}
          progress={progress}
          onFiles={handleFiles}
        />
      )}
    </div>
  );

  return createPortal(panel, document.body);
}

function labelOf(accept: PickerAccept): string {
  return accept === 'video' ? '视频' : accept === 'audio' ? '音频' : '图片';
}
