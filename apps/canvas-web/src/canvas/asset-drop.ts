import { canvasApi } from '../api/canvas';
import { assetTypeOf, uploadAsset } from '../lib/upload-asset';
import type { AssetMediaType, AssetInputData } from '../nodes/asset_input/schema';
import { assetInputSchema, titleForMedia } from '../nodes/asset_input/schema';
import type { CanvasNodeData } from '../nodes/types';
import { toast } from '../ui';
import { useCanvasStore } from './canvas-state';
import { useCanvasUI } from './ui-state';

const OFFSET = 32;
const ACCEPT = 'image/*,video/*,audio/*';

function mediaFilesOf(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => {
    const t = assetTypeOf(f.type);
    return t === 'image' || t === 'video' || t === 'audio';
  });
}

/** Collect File objects from a paste ClipboardEvent (files + image items). */
export function filesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  const fromFiles = mediaFilesOf(clipboardData.files);
  if (fromFiles.length) return fromFiles;

  const out: File[] = [];
  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (!f) continue;
    const t = assetTypeOf(f.type);
    if (t === 'image' || t === 'video' || t === 'audio') out.push(f);
  }
  return out;
}

/** Open a system file picker; cancel / empty returns []. */
export function pickAssetFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      resolve(files);
    };
    input.onchange = () => finish(mediaFilesOf(input.files));
    // Some browsers fire focus back on cancel without change — treat as cancel.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => finish(mediaFilesOf(input.files)), 300);
      },
      { once: true },
    );
    input.click();
  });
}

/** Palette / context-menu entry: pick files then create asset nodes. Cancel = no node. */
export async function addAssetInputFromPicker(
  projectId: string,
  flowPos: { x: number; y: number },
): Promise<number> {
  if (!useCanvasUI.getState().canEdit) {
    toast.error('只读模式:你没有编辑权限');
    return 0;
  }
  const files = await pickAssetFiles();
  if (!files.length) return 0;
  return createAssetNodesFromFiles(projectId, files, flowPos);
}

/**
 * Upload one or more media files and create asset_input nodes at `flowPos`
 * (staggered by OFFSET for each subsequent file). Returns the count created.
 */
export async function createAssetNodesFromFiles(
  projectId: string,
  files: FileList | File[],
  flowPos: { x: number; y: number },
): Promise<number> {
  if (!useCanvasUI.getState().canEdit) {
    toast.error('只读模式:你没有编辑权限');
    return 0;
  }
  const mediaFiles = mediaFilesOf(files);
  if (!mediaFiles.length) return 0;

  const { setNodes, setSelected, patchNodeData } = useCanvasStore.getState();
  let created = 0;

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const media = assetTypeOf(file.type) as AssetMediaType;
    const position = { x: flowPos.x + i * OFFSET, y: flowPos.y + i * OFFSET };
    const persistData: AssetInputData & CanvasNodeData = {
      ...assetInputSchema.defaultData,
      media_type: media,
      asset_name: file.name,
      title: titleForMedia(media),
    };

    let nodeId: string | null = null;
    try {
      const row = await canvasApi.createNode(projectId, {
        type: 'asset_input',
        position,
        data: persistData as never,
      });
      nodeId = row.id;
      setNodes((prev) => [
        ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
        {
          id: row.id,
          type: row.type,
          position: row.position,
          data: { ...row.data, status: 'pending' } as never,
          selected: i === mediaFiles.length - 1,
        },
      ]);
      if (i === mediaFiles.length - 1) setSelected(row.id);

      const asset = await uploadAsset(file, { project_id: projectId });
      const filled: AssetInputData & CanvasNodeData = {
        media_type: media,
        output_asset_id: asset.id,
        asset_name: asset.name ?? file.name,
        media_width: asset.width ?? undefined,
        media_height: asset.height ?? undefined,
        duration_ms: asset.duration_ms ?? undefined,
        title: titleForMedia(media),
        status: 'idle',
      };
      const { status: _s, ...persist } = filled;
      await canvasApi.updateNode(projectId, row.id, { data: persist as never });
      patchNodeData(row.id, filled);
      created += 1;
    } catch (e) {
      toast.error((e as Error).message || `上传失败: ${file.name}`);
      if (nodeId) {
        const id = nodeId;
        setNodes((prev) => prev.filter((n) => n.id !== id));
        canvasApi.removeNode(projectId, id).catch(() => undefined);
      }
    }
  }

  return created;
}
