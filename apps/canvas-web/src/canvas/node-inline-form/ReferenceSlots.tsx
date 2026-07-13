import { useRef, useState } from 'react';
import type { GenerationReference, GenerationReferenceType } from '@xgcanvas/shared-types';

import ResourcePicker, { type PickerAccept } from '../../components/resource-picker/ResourcePicker';
import type { LibraryEntryRecord } from '../../api/library';
import {
  referenceTypeMatches,
  referenceCapacity,
  reorderReferences,
  selectableLibraryKinds,
  slotLimitLabel,
  type GenerationSlotView,
} from '../../generation/input-contract-ui';
import { useAssetUrl } from '../../hooks/useAssetUrl';
import { useCanvasStore } from '../canvas-state';
import { scheduleNodeUpdate } from '../sync/auto-save';

interface Props {
  nodeId: string;
  projectId: string;
  slots: GenerationSlotView[];
}

interface InboundRef {
  type: GenerationReferenceType;
  /** Present when the upstream node has already produced an asset. */
  assetId?: string;
  /** True when an inbound edge matches this type even if output is not ready. */
  linked: boolean;
}

/** Reference slots: upstream edges fill slots automatically; empty capacity can
 *  still open ResourcePicker (upstream + manual coexist). Manual picks persist
 *  in node.data.manual_references. */
export default function ReferenceSlots({ nodeId, projectId, slots }: Props) {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  if (slots.length === 0) return null;

  const node = nodes.find((n) => n.id === nodeId);
  const manual = Array.isArray(node?.data?.manual_references)
    ? (node?.data?.manual_references as GenerationReference[])
    : [];

  const inbound = edges.filter((e) => e.target === nodeId);
  const refs: InboundRef[] = inbound.map((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const base = String((edge.data as { data_type?: string } | undefined)?.data_type ?? '').split(
      ':',
    )[0];
    const assetId = (source?.data as { output_asset_id?: string } | undefined)?.output_asset_id;
    return {
      type: toReferenceType(base),
      assetId: typeof assetId === 'string' ? assetId : undefined,
      linked: true,
    };
  });

  const persistManual = (next: GenerationReference[]) => {
    useCanvasStore
      .getState()
      .patchNodeData(nodeId, { manual_references: reorderReferences(next) } as never);
    const fresh = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    const { status: _s, task_id: _t, ...rest } = (fresh?.data ?? {}) as Record<string, unknown>;
    scheduleNodeUpdate(projectId, nodeId, { data: rest });
  };

  return (
    <div className="nif-refs">
      {slots.map((slot, index) => {
        const matched = refs.filter((ref) => referenceTypeMatches(ref.type, slot.type));
        const max = slot.max ?? 1;
        const offset =
          max > 1
            ? 0
            : slots
                .slice(0, index)
                .filter(
                  (prev) => (prev.max ?? 1) <= 1 && referenceTypeMatches(slot.type, prev.type),
                ).length;
        const slotRefs = max > 1 ? matched.slice(0, max) : matched.slice(offset, offset + 1);
        const upstreamReady = slotRefs.filter((ref) => ref.assetId).length;
        const upstreamLinked = slotRefs.filter((ref) => ref.linked).length;
        const slotManual = manual.filter((ref) => ref.slot === slot.slot);
        const manualUnits = slotManual.reduce((sum, ref) => sum + referenceCapacity(ref), 0);
        const total = upstreamReady + manualUnits;
        const pending = upstreamLinked > upstreamReady;
        return (
          <RefSlot
            key={`${slot.slot}:${slot.type}`}
            slot={slot}
            projectId={projectId}
            assetId={
              slotRefs.find((ref) => ref.assetId)?.assetId ??
              slotManual[0]?.asset_id ??
              (slotManual[0]?.metadata as { cover_asset_id?: string } | undefined)?.cover_asset_id
            }
            count={total}
            pending={pending && total === 0}
            canPick={total < max}
            hasManual={slotManual.length > 0}
            onPick={(assetId) => {
              if (slotManual.some((ref) => ref.asset_id === assetId)) return;
              if (total >= max) return;
              persistManual([...manual, { slot: slot.slot, type: slot.type, asset_id: assetId }]);
            }}
            onPickLibrary={(entry) => {
              if (slotManual.some((ref) => ref.library_entry_id === entry.id)) return;
              const materialCount = entry.material?.asset_ids.length ?? 0;
              if (materialCount < 1 || total + materialCount > max) return;
              const cover = entry.cover_asset_id ?? entry.material?.asset_ids[0];
              persistManual([
                ...manual,
                {
                  slot: slot.slot,
                  type: 'library_ref',
                  library_entry_id: entry.id,
                  metadata: {
                    ...(cover ? { cover_asset_id: cover } : {}),
                    material_asset_count: materialCount,
                  },
                },
              ]);
            }}
            onClearManual={() => {
              const first = slotManual[0];
              if (!first) return;
              persistManual(manual.filter((ref) => !sameReference(ref, first)));
            }}
          />
        );
      })}
    </div>
  );
}

function RefSlot({
  slot,
  projectId,
  assetId,
  count,
  pending,
  canPick,
  hasManual,
  onPick,
  onPickLibrary,
  onClearManual,
}: {
  slot: GenerationSlotView;
  projectId: string;
  assetId?: string;
  count: number;
  pending: boolean;
  canPick: boolean;
  hasManual: boolean;
  onPick(assetId: string): void;
  onPickLibrary(entry: LibraryEntryRecord): void;
  onClearManual(): void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const url = useAssetUrl(assetId ?? null, 3600, slot.type === 'video' ? 'thumb' : 'full');
  const filled = count > 0 || pending;
  return (
    <div
      className={`nif-ref${filled ? ' nif-ref--filled' : ''}${slot.required ? ' nif-ref--required' : ''}${pending ? ' nif-ref--pending' : ''}`}
    >
      <button
        ref={anchorRef}
        type="button"
        className="nif-ref__trigger"
        title={pending ? `${slot.label}（已连线，待上游生成）` : slotLimitLabel(slot)}
        aria-label={`${slot.label}，${slotLimitLabel(slot)}`}
        disabled={!canPick}
        onClick={() => setOpen((value) => !value)}
      >
        {url && slot.type !== 'audio' ? <img src={url} alt="" /> : <SlotIcon type={slot.type} />}
        <span className="nif-ref__label">
          {pending && count === 0 ? '待生成' : count > 1 ? `${slot.label}·${count}` : slot.label}
        </span>
      </button>
      {hasManual ? (
        <button
          ref={removeRef}
          type="button"
          className="nif-ref__remove"
          aria-label="移除参考"
          onClick={(e) => {
            e.stopPropagation();
            onClearManual();
          }}
        >
          ×
        </button>
      ) : null}
      <ResourcePicker
        open={open}
        onClose={() => setOpen(false)}
        accept={acceptOf(slot.type)}
        projectId={projectId}
        anchorRef={anchorRef}
        returnFocusRef={removeRef}
        onSelect={(asset) => onPick(asset.id)}
        libraryKinds={selectableLibraryKinds(slot)}
        libraryMaxAssets={Math.max(0, (slot.max ?? 1) - count)}
        onSelectLibrary={onPickLibrary}
      />
    </div>
  );
}

function SlotIcon({ type }: { type: string }) {
  if (type === 'audio') {
    return (
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
        <path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8" />
      </svg>
    );
  }
  if (type === 'video') {
    return (
      <svg
        width="15"
        height="15"
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
      width="15"
      height="15"
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
}

function toReferenceType(base: string): GenerationReferenceType {
  if (base === 'audio') return 'audio';
  if (base === 'video') return 'video';
  if (base === 'mask') return 'mask';
  if (base === 'grid' || base === 'image_list') return 'image_list';
  return 'image';
}

function acceptOf(type: string): PickerAccept {
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  return 'image';
}

function sameReference(a: GenerationReference, b: GenerationReference): boolean {
  return (
    a.slot === b.slot &&
    (a.asset_id ? a.asset_id === b.asset_id : a.library_entry_id === b.library_entry_id)
  );
}
