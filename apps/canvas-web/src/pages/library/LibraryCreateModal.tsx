import { useState } from 'react';

import { Modal, Segmented, toast } from '../../ui';
import { libraryApi } from '../../api/library';
import type { AssetRecord } from '../../api/asset';
import ResourcePicker, { type PickerAccept } from '../../components/resource-picker/ResourcePicker';
import { useAssetUrl } from '../../hooks/useAssetUrl';

interface Props {
  open: boolean;
  kind: 'character' | 'voice' | 'style';
  onClose(): void;
  onCreated(): void;
}

type Visibility = 'private' | 'workspace';

export default function LibraryCreateModal({ open, kind, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('workspace');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept: PickerAccept = kind === 'voice' ? 'audio' : 'image';

  const submit = async () => {
    if (!name.trim()) {
      toast.warning('请输入名称');
      return;
    }
    setSaving(true);
    try {
      await libraryApi.create({
        kind,
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        material: materialIds.length ? { asset_ids: materialIds } : undefined,
        cover_asset_id: kind === 'voice' ? undefined : materialIds[0],
      });
      toast.success('已创建');
      setName('');
      setDescription('');
      setMaterialIds([]);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`新建${kind === 'voice' ? '音色' : kind === 'style' ? '风格' : '人物'}条目`}
      width={480}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn--primary" disabled={saving} onClick={submit}>
            {saving ? '创建中…' : '创建'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <div className="text-xs text-text-3 mb-1">名称</div>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-text-3 mb-1">描述</div>
          <textarea
            className="input w-full min-h-[64px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'voice' ? '音色特征描述,如:温暖的中年男声' : '外观/风格特征描述'}
          />
        </div>
        <div>
          <div className="text-xs text-text-3 mb-1">可见性</div>
          <Segmented<Visibility>
            options={[
              { label: '工作区共享', value: 'workspace' },
              { label: '仅自己', value: 'private' },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <div className="text-xs text-text-3 mb-1">
            自有素材({kind === 'voice' ? '参考音频' : '参考图'},可选；厂商绑定待验证流程开放)
          </div>
          <div className="flex gap-2 flex-wrap">
            {materialIds.map((id) => (
              <MaterialThumb
                key={id}
                assetId={id}
                onRemove={() => setMaterialIds((s) => s.filter((x) => x !== id))}
              />
            ))}
            <button
              type="button"
              className="w-14 h-14 rounded-md border border-dashed border-canvas-border text-text-3 hover:border-cyan"
              onClick={() => setPickerOpen(true)}
            >
              +
            </button>
          </div>
          <ResourcePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            accept={accept}
            onSelect={(asset: AssetRecord) =>
              setMaterialIds((s) => (s.includes(asset.id) ? s : [...s, asset.id]))
            }
          />
        </div>
      </div>
    </Modal>
  );
}

function MaterialThumb({ assetId, onRemove }: { assetId: string; onRemove(): void }) {
  const url = useAssetUrl(assetId);
  return (
    <div className="relative w-14 h-14 rounded-md overflow-hidden bg-canvas-panel-2 border border-canvas-border-soft">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : null}
      <button
        type="button"
        aria-label="移除素材"
        className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-white text-[10px] leading-none"
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
