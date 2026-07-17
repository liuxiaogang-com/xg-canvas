import { useEffect, useMemo } from 'react';
import type { GenerationReference } from '@xgcanvas/shared-types';

import { getSchema } from '../../nodes/registry';
import type { CanvasNodeData } from '../../nodes/types';
import {
  defaultParamValue,
  isValidParamValue,
  modeContract,
  modeOptionsFromContract,
  preferredModelId,
  slotsForMode,
  splitModelVersionParam,
} from '../../generation/input-contract-ui';
import { isPromptDocument, promptDocumentReferences } from '../../generation/prompt-mentions';
import { useCanvasStore } from '../canvas-state';
import { useCanvasUI } from '../ui-state';
import { useNodeRunner } from '../hooks/useNodeRunner';
import { useSelectedNodeAnchor } from '../hooks/useSelectedNodeAnchor';
import { scheduleNodeUpdate } from '../sync/auto-save';
import CostBadge from './CostBadge';
import ModelPicker from './ModelPicker';
import ModelVersionPicker from './ModelVersionPicker';
import ModeTabs from './ModeTabs';
import ParamChips from './ParamChips';
import PromptField from './PromptField';
import ReferenceSlots from './ReferenceSlots';
import SubmitButton from './SubmitButton';
import { useCostEstimate, useInlineModel } from './useInlineModel';
// TEMP: re-enable with PromptField.ENABLE_PROMPT_MENTION — do not delete.
// import { useNodeMentionCandidates } from './useNodeMentionCandidates';
import './NodeInlineForm.css';
import './NodeInlineControls.css';

interface Props {
  projectId: string;
  /** open the expanded large editor (reuses NodeDetailPanel). */
  onExpand?(nodeId: string): void;
}

/**
 * v0.4 inline generation form (LibTV paradigm). Anchored below the selected
 * generation node; tracks pan / zoom / move / aspect-ratio changes via
 * useSelectedNodeAnchor. Driven by schema.form + the selected model's params.
 */
export default function NodeInlineForm({ projectId, onExpand: _onExpand }: Props) {
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const resizing = useCanvasUI((s) => s.resizing);
  const dragging = useCanvasUI((s) => s.dragging);
  const canEdit = useCanvasUI((s) => s.canEdit);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === selectedId));
  const schema = node ? getSchema(node.type ?? '') : null;
  const form = schema?.form ?? null;
  const runner = useNodeRunner();
  // TEMP: @ mention parked (PromptField.ENABLE_PROMPT_MENTION).
  // const mentionCandidates = useNodeMentionCandidates(projectId, selectedId ?? '');
  const anchor = useSelectedNodeAnchor('bottom');

  const data = (node?.data ?? {}) as CanvasNodeData;
  const modelField = form?.modelField ?? 'model_id';
  const modeField = form?.modeField ?? 'mode';
  const promptField = form?.prompt?.field ?? 'prompt';
  const modelId = (data[modelField] as string | null) ?? null;
  const mode = (data[modeField] as string) ?? form?.modes?.[0]?.id ?? '';
  const taskType = typeof form?.taskType === 'function' ? form.taskType(data) : form?.taskType ?? '';

  const { models, selectedModel, specs, defaults, inputContract } = useInlineModel(
    taskType,
    modelId,
  );
  const { modelVersionSpec, paramSpecs } = splitModelVersionParam(specs);
  const modelSource = selectedModel
    ? selectedModel.provider.display_name || selectedModel.provider.key
    : undefined;

  const visibleModes = useMemo(() => {
    if (!form?.modes?.length) return undefined;
    return modeOptionsFromContract(inputContract, form.modes);
  }, [form, inputContract]);

  const paramValues = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const s of specs) out[s.field] = data[s.field] ?? defaults[s.field] ?? s.default;
    return out;
  }, [specs, data, defaults]);

  const cost = useCostEstimate(modelId, paramValues, !!form?.cost, selectedModel);

  const persist = (patch: Record<string, unknown>) => {
    if (!node) return;
    useCanvasStore.getState().patchNodeData(node.id, patch as never);
    const fresh = useCanvasStore.getState().nodes.find((n) => n.id === node.id);
    scheduleNodeUpdate(projectId, node.id, { data: stripTransient(fresh?.data) });
  };

  useEffect(() => {
    if (canEdit && form && !modelId && models.length > 0) persist({ [modelField]: preferredModelId(models) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, modelId, form, canEdit]);

  useEffect(() => {
    if (!canEdit || !form || !visibleModes?.length) return;
    if (!visibleModes.some((m) => m.id === mode)) {
      persist({ [modeField]: inputContract?.default_mode ?? visibleModes[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModes, mode, form, canEdit, inputContract]);

  useEffect(() => {
    if (!canEdit || !node || specs.length === 0) return;
    const missing: Record<string, unknown> = {};
    for (const s of specs) {
      const current = data[s.field] ?? defaults[s.field];
      const def = defaults[s.field] ?? defaultParamValue(s);
      if (!isValidParamValue(s, current) && def !== undefined) missing[s.field] = def;
    }
    if (Object.keys(missing).length) persist(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs]);

  const activeMode = modeContract(inputContract, mode);
  const activePorts = visibleModes?.find((m) => m.id === mode)?.requires ?? null;
  const activeSlots = slotsForMode(activeMode, form?.referenceSlots ?? [], activePorts);
  const promptVal = (data[promptField] as string) ?? '';
  const promptDoc = isPromptDocument(data.prompt_doc) ? data.prompt_doc : undefined;
  const promptReferences = useMemo(
    () => promptDocumentReferences(promptDoc, activeSlots),
    [activeSlots, promptDoc],
  );
  const promptReferencesKey = JSON.stringify(promptReferences);
  const storedPromptReferences = Array.isArray(data.prompt_references)
    ? (data.prompt_references as GenerationReference[])
    : [];
  const storedPromptReferencesKey = JSON.stringify(storedPromptReferences);
  const busy = data.status === 'running' || data.status === 'queued';

  useEffect(() => {
    if (!canEdit || !node || !form) return;
    if (storedPromptReferencesKey !== promptReferencesKey) {
      persist({ prompt_references: promptReferences });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, node?.id, form, promptReferencesKey, storedPromptReferencesKey]);

  if (!node || !form || !anchor || resizing || dragging) return null;

  return (
    <div
      className="nif"
      style={{
        left: anchor.screenX,
        top: anchor.screenY,
        transform: 'translate(-50%, 12px)',
        ...(canEdit ? {} : { pointerEvents: 'none', opacity: 0.65 }),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* TEMP: NodeDetailPanel expand UX parked — do NOT delete. Re-enable with onExpand prop.
      {onExpand ? (
        <div className="nif__head">
          <button type="button" className="nif__expand" title="放大编辑" onClick={() => onExpand(node.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" />
            </svg>
          </button>
        </div>
      ) : null}
      */}

      {activeSlots.length ? (
        <ReferenceSlots nodeId={node.id} projectId={projectId} slots={activeSlots} />
      ) : null}

      {form.prompt ? (
        <PromptField
          value={promptVal}
          document={promptDoc}
          // TEMP: mention + placeholder gated inside PromptField — keep wiring, do not delete.
          placeholder={form.prompt.placeholder}
          // candidates={form.prompt.mention ? mentionCandidates : []}
          onChange={(v, doc) =>
            persist({
              [promptField]: v,
              prompt_doc: doc,
              prompt_references: promptDocumentReferences(doc, activeSlots),
            })
          }
        />
      ) : null}

      <div className="nif__foot">
        <ModelVersionPicker
          spec={modelVersionSpec}
          value={paramValues.model_version}
          sourceLabel={modelSource}
          onChange={(v) => persist({ model_version: v })}
        />
        <ModelPicker models={models} value={modelId} onChange={(id) => persist({ [modelField]: id })} />
        {visibleModes && visibleModes.length > 1 ? (
          <ModeTabs modes={visibleModes} value={mode} onChange={(id) => persist({ [modeField]: id })} />
        ) : null}
        <ParamChips
          specs={paramSpecs}
          values={paramValues}
          onChange={(f, v) => {
            if (f === 'ratio' && typeof v === 'string') persist({ ratio: v, aspect_ratio: v });
            else persist({ [f]: v });
          }}
        />
        <div className="nif__spacer" />
        {form.cost ? <CostBadge cost={cost} /> : null}
        <SubmitButton
          label={form.submit.label}
          disabled={!selectedModel}
          busy={busy}
          onClick={() => runner.submit(node.id, projectId)}
        />
      </div>
    </div>
  );
}

function stripTransient(d: CanvasNodeData | undefined): Record<string, unknown> {
  if (!d) return {};
  const { status: _s, task_id: _t, ...rest } = d;
  return rest as Record<string, unknown>;
}
