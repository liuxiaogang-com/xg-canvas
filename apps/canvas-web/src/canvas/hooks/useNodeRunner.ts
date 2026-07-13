import { useCallback, useEffect } from 'react';
import type { GenerationReference } from '@xgcanvas/shared-types';

import { modelApi } from '../../api/model';
import { taskApi, type TaskRecord } from '../../api/task';
import {
  ensureInputMode,
  filterRefsForSlots,
  missingRequiredSlots,
  modeContract,
  slotsForMode,
  type GenerationSlotView,
} from '../../generation/input-contract-ui';
import { isPromptDocument, mergeGenerationReferences } from '../../generation/prompt-mentions';
import { getSchema } from '../../nodes/registry';
import type { CanvasNodeData } from '../../nodes/types';
import { toast } from '../../ui';
import { useCanvasStore } from '../canvas-state';
import {
  abandonNodeSubmission,
  beginNodeSubmission,
  captureSubmissionBoundary,
  isNodeSubmissionCurrent,
  resumeNodeTaskPoll,
  startNodeTaskPoll,
  stopProjectTaskPolls,
} from '../task-poll-manager';
import { acceptTypesFromSlots, resolveUpstream } from '../upstream-resolver';

/**
 * Submit a task tied to a canvas node. Polling is process-wide so the toolbar,
 * inline form and other entrypoints cannot race stale responses into a node.
 * Terminal persistence is server-owned; the client only projects live state.
 */
export function useNodeRunner() {
  const patch = useCanvasStore.getState().patchNodeData;

  const submit = useCallback(
    async (nodeId: string, projectId: string) => {
      const generation = beginNodeSubmission(nodeId, projectId);
      const initial = useCanvasStore.getState();
      const node = initial.nodes.find((candidate) => candidate.id === nodeId);
      if (!node || initial.projectId !== projectId) {
        abandonNodeSubmission(nodeId, projectId, generation);
        return;
      }
      const schema = getSchema(node.type ?? '');
      if (!schema) {
        abandonNodeSubmission(nodeId, projectId, generation);
        toast.warning('未识别的节点类型');
        return;
      }

      const data = node.data as CanvasNodeData;
      let mode = String(data.mode ?? '');
      let requires =
        schema.form?.modes?.find((candidate) => candidate.id === mode)?.requires ?? null;
      const fallbackSlots = schema.form?.referenceSlots ?? [];
      // Resolve every declared media type up front. The authoritative model
      // contract may normalize an old mode after the user switches models.
      const acceptTypes = acceptTypesFromSlots(fallbackSlots);
      const upstream = resolveUpstream(nodeId, initial.nodes, initial.edges, { acceptTypes });
      let body = schema.buildTaskBody(node.data as never, upstream);

      // The model contract is the authority for active slots. schema() is
      // already fetched by the inline form in normal use; failure falls back
      // to the local node declaration and the server validates once more.
      let slots = slotsForMode(undefined, fallbackSlots, requires);
      try {
        const modelSchema = await modelApi.schema(body.model_id);
        if (!isNodeSubmissionCurrent(nodeId, projectId, generation)) return;
        const normalizedMode = ensureInputMode(
          modelSchema.input_contract,
          asMode(body.inputs.mode, mode),
        );
        if (normalizedMode) {
          const changed = normalizedMode !== body.inputs.mode;
          mode = normalizedMode;
          requires =
            schema.form?.modes?.find((candidate) => candidate.id === mode)?.requires ?? null;
          if (changed) body = schema.buildTaskBody({ ...node.data, mode } as never, upstream);
          body.inputs.mode = mode;
        }
        slots = slotsForMode(
          modeContract(modelSchema.input_contract, mode),
          fallbackSlots,
          requires,
        );
      } catch {
        if (!isNodeSubmissionCurrent(nodeId, projectId, generation)) return;
      }

      const references = applyPromptMentionsToBody(body.inputs, data, slots);
      const missing = missingRequiredSlots(slots, references);
      if (missing.length > 0) {
        abandonNodeSubmission(nodeId, projectId, generation);
        toast.warning(`请先补充${missing[0].label}`);
        return;
      }

      patch(nodeId, { status: 'queued', task_id: undefined });
      try {
        const created = await taskApi.create({
          ...body,
          project_id: projectId,
          source_node_id: nodeId,
        } as never);
        if (!isNodeSubmissionCurrent(nodeId, projectId, generation)) {
          // A newer click won while this request was in flight. Stop wasting
          // vendor capacity, but never let this response touch the node.
          void taskApi.cancel(created.id).catch(() => undefined);
          return;
        }
        patch(nodeId, { status: 'queued', task_id: created.id });
        startNodeTaskPoll(nodeId, projectId, created.id, generation);
      } catch (error) {
        if (!isNodeSubmissionCurrent(nodeId, projectId, generation)) return;
        patch(nodeId, { status: 'failed' });
        abandonNodeSubmission(nodeId, projectId, generation);
        toast.error((error as Error).message);
      }
    },
    [patch],
  );

  return { submit };
}

/** Resume only current, non-superseded active tasks returned by the server. */
export function useCanvasTaskResume(projectId: string | undefined): void {
  const loaded = useCanvasStore((state) => state.loaded);

  useEffect(() => {
    if (!projectId || !loaded) return;
    let cancelled = false;
    const submissionBoundary = captureSubmissionBoundary();

    void (async () => {
      try {
        const tasks = await taskApi.list({ project_id: projectId, active: true, limit: 200 });
        if (cancelled || useCanvasStore.getState().projectId !== projectId) return;
        for (const task of pickLatestPerNode(tasks)) {
          if (!task.source_node_id) continue;
          const node = useCanvasStore
            .getState()
            .nodes.find((candidate) => candidate.id === task.source_node_id);
          if (!node) continue;
          const resumed = resumeNodeTaskPoll(
            task.source_node_id,
            projectId,
            task.id,
            submissionBoundary,
          );
          if (!resumed) continue;
          useCanvasStore.getState().patchNodeData(task.source_node_id, {
            status: task.status,
            task_id: task.id,
          });
        }
      } catch (error) {
        console.error('[canvas-task-resume] failed', error);
      }
    })();

    return () => {
      cancelled = true;
      stopProjectTaskPolls(projectId);
    };
  }, [projectId, loaded]);
}

function pickLatestPerNode(tasks: TaskRecord[]): TaskRecord[] {
  const seen = new Set<string>();
  const out: TaskRecord[] = [];
  for (const task of tasks) {
    if (!task.source_node_id || seen.has(task.source_node_id)) continue;
    seen.add(task.source_node_id);
    out.push(task);
  }
  return out;
}

function applyPromptMentionsToBody(
  inputs: Record<string, unknown>,
  data: CanvasNodeData,
  slots: GenerationSlotView[],
): GenerationReference[] {
  if (isPromptDocument(data.prompt_doc)) inputs.prompt_doc = data.prompt_doc;
  const explicitRefs = filterRefsForSlots(asReferences(inputs.references), slots);
  const manualRefs = filterRefsForSlots(asReferences(data.manual_references), slots);
  const promptRefs = filterRefsForSlots(asReferences(data.prompt_references), slots);
  const references = mergeGenerationReferences(explicitRefs, [...manualRefs, ...promptRefs], slots);
  inputs.references = references;
  return references;
}

function asReferences(value: unknown): GenerationReference[] {
  return Array.isArray(value) ? (value as GenerationReference[]) : [];
}

function asMode(value: unknown, fallback: string): string | null {
  return typeof value === 'string' && value ? value : fallback || null;
}
