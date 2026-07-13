import { useRef, useState } from 'react';
import type { GenerationReference } from '@xgcanvas/shared-types';

import ResourcePicker, {
  type PickerAccept,
} from '../../../components/resource-picker/ResourcePicker';
import type { LibraryEntryRecord } from '../../../api/library';
import { useAssetUrl } from '../../../hooks/useAssetUrl';
import { toast } from '../../../ui';
import {
  reorderReferences,
  referenceCapacity,
  selectableLibraryKinds,
  slotLimitLabel,
  type GenerationSlotView,
} from '../../../generation/input-contract-ui';

interface Props {
  slots: GenerationSlotView[];
  references: GenerationReference[];
  onChange(refs: GenerationReference[]): void;
}

const Plus = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const MediaIcon = ({ type }: { type: string }) => {
  if (type === 'audio') {
    return (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" />
      </svg>
    );
  }
  if (type === 'video') {
    return (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9l5 3-5 3z" />
      </svg>
    );
  }
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
};

export default function ReferenceUploader({ slots, references, onChange }: Props) {
  if (slots.length === 0) return null;
  return (
    <div className="qg-reftray">
      {slots.map((slot) => (
        <ReferenceSlotCard
          key={`${slot.slot}:${slot.type}`}
          slot={slot}
          references={references.filter((ref) => ref.slot === slot.slot)}
          allReferences={references}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function ReferenceSlotCard({
  slot,
  references,
  allReferences,
  onChange,
}: {
  slot: GenerationSlotView;
  references: GenerationReference[];
  allReferences: GenerationReference[];
  onChange(refs: GenerationReference[]): void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const first = references[0];
  const previewAssetId =
    first?.asset_id ??
    (first?.metadata as { cover_asset_id?: string } | undefined)?.cover_asset_id ??
    null;
  const firstUrl = useAssetUrl(previewAssetId, 3600, slot.type === 'video' ? 'thumb' : 'full');
  const usedCapacity = references.reduce((sum, ref) => sum + referenceCapacity(ref), 0);
  const full = slot.max !== undefined && usedCapacity >= slot.max;

  const guard = (units: number) => {
    if (slot.max !== undefined && usedCapacity + units > slot.max) {
      toast.warning(`${slot.label} 已达到数量上限`);
      return false;
    }
    return true;
  };

  const add = (assetId: string) => {
    if (!guard(1) || references.some((item) => item.asset_id === assetId)) return;
    onChange(
      reorderReferences([
        ...allReferences,
        { asset_id: assetId, slot: slot.slot, type: slot.type },
      ]),
    );
  };

  const addLibrary = (entry: LibraryEntryRecord) => {
    const materialCount = entry.material?.asset_ids.length ?? 0;
    if (materialCount < 1) {
      toast.warning('该库条目没有可用于当前模型的自有素材');
      return;
    }
    if (!guard(materialCount) || references.some((item) => item.library_entry_id === entry.id))
      return;
    const cover = entry.cover_asset_id ?? entry.material?.asset_ids[0];
    onChange(
      reorderReferences([
        ...allReferences,
        {
          slot: slot.slot,
          type: 'library_ref',
          library_entry_id: entry.id,
          metadata: {
            ...(cover ? { cover_asset_id: cover } : {}),
            material_asset_count: materialCount,
          },
        },
      ]),
    );
  };

  const removeFirst = () => {
    if (!first) return;
    onChange(
      reorderReferences(
        allReferences.filter(
          (item) =>
            !(
              item.slot === slot.slot &&
              (first.asset_id
                ? item.asset_id === first.asset_id
                : item.library_entry_id === first.library_entry_id)
            ),
        ),
      ),
    );
  };

  return (
    <div className={`qg-refslot${references.length ? ' qg-refslot--filled' : ''}`}>
      <button
        type="button"
        className="qg-refslot__main"
        ref={anchorRef}
        onClick={() => !full && setOpen((o) => !o)}
      >
        <span className="qg-refslot__thumb">
          {firstUrl && slot.type !== 'audio' ? (
            <img src={firstUrl} alt="" />
          ) : (
            <MediaIcon type={slot.type} />
          )}
        </span>
        <span className="qg-refslot__body">
          <span className="qg-refslot__label">{slot.label}</span>
          <span className="qg-refslot__meta">
            {usedCapacity
              ? `${usedCapacity}${slot.max && slot.max > 1 ? `/${slot.max}` : ''}`
              : slotLimitLabel(slot)}
          </span>
        </span>
        {!full ? <span className="qg-refslot__plus">{Plus}</span> : null}
      </button>
      {first?.asset_id || first?.library_entry_id ? (
        <button
          type="button"
          className="qg-refslot__remove"
          aria-label="移除参考素材"
          onClick={removeFirst}
        >
          ×
        </button>
      ) : null}
      <ResourcePicker
        open={open}
        onClose={() => setOpen(false)}
        accept={acceptOf(slot.type)}
        anchorRef={anchorRef}
        onSelect={(asset) => add(asset.id)}
        libraryKinds={selectableLibraryKinds(slot)}
        libraryMaxAssets={slot.max === undefined ? undefined : Math.max(0, slot.max - usedCapacity)}
        onSelectLibrary={addLibrary}
      />
    </div>
  );
}

function acceptOf(type: string): PickerAccept {
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  return 'image';
}
