import { ApiError } from '../api/client';
import { taskApi, type TaskRecord } from '../api/task';
import { toast } from '../ui';
import type { CanvasNodeData } from '../nodes/types';
import { useCanvasStore } from './canvas-state';

const BASE_POLL_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const RECONNECT_NOTICE_AFTER = 5;

interface SubmissionToken {
  generation: number;
  projectId: string;
}

interface PollEntry extends SubmissionToken {
  nodeId: string;
  taskId: string;
  failures: number;
  reconnectNoticeShown: boolean;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
}

let nextGeneration = 0;
const submissions = new Map<string, SubmissionToken>();
const polls = new Map<string, PollEntry>();
const lastSubmissionGeneration = new Map<string, number>();

/** Invalidates every older submit/poll for this node across all UI entrypoints. */
export function beginNodeSubmission(nodeId: string, projectId: string): number {
  cancelNodeTaskPoll(nodeId);
  const generation = ++nextGeneration;
  submissions.set(nodeId, { generation, projectId });
  lastSubmissionGeneration.set(nodeId, generation);
  return generation;
}

/** Snapshot used to stop a stale hydration response replacing a newer submit. */
export function captureSubmissionBoundary(): number {
  return nextGeneration;
}

export function isNodeSubmissionCurrent(
  nodeId: string,
  projectId: string,
  generation: number,
): boolean {
  const current = submissions.get(nodeId);
  return current?.generation === generation && current.projectId === projectId;
}

export function abandonNodeSubmission(nodeId: string, projectId: string, generation: number): void {
  if (isNodeSubmissionCurrent(nodeId, projectId, generation)) submissions.delete(nodeId);
}

/** Starts one globally shared poll. An already-running request is aborted. */
export function startNodeTaskPoll(
  nodeId: string,
  projectId: string,
  taskId: string,
  generation: number,
  immediate = false,
): void {
  if (!isNodeSubmissionCurrent(nodeId, projectId, generation)) return;
  cancelNodeTaskPoll(nodeId, false);
  const entry: PollEntry = {
    nodeId,
    projectId,
    taskId,
    generation,
    failures: 0,
    reconnectNoticeShown: false,
  };
  polls.set(nodeId, entry);
  schedule(entry, immediate ? 0 : BASE_POLL_MS);
}

/** Hydration uses the same generation guard as a fresh submission. */
export function resumeNodeTaskPoll(
  nodeId: string,
  projectId: string,
  taskId: string,
  notAfterGeneration = nextGeneration,
): boolean {
  const existing = polls.get(nodeId);
  if (existing?.taskId === taskId && existing.projectId === projectId) return false;
  if (submissions.has(nodeId)) return false;
  if ((lastSubmissionGeneration.get(nodeId) ?? 0) > notAfterGeneration) return false;
  const generation = beginNodeSubmission(nodeId, projectId);
  startNodeTaskPoll(nodeId, projectId, taskId, generation, true);
  return true;
}

export function stopProjectTaskPolls(projectId: string): void {
  for (const [nodeId, entry] of polls) {
    if (entry.projectId === projectId) cancelNodeTaskPoll(nodeId);
  }
  for (const [nodeId, token] of submissions) {
    if (token.projectId === projectId) submissions.delete(nodeId);
  }
}

function cancelNodeTaskPoll(nodeId: string, invalidateSubmission = true): void {
  const entry = polls.get(nodeId);
  if (entry?.timer) clearTimeout(entry.timer);
  entry?.controller?.abort();
  polls.delete(nodeId);
  if (invalidateSubmission) submissions.delete(nodeId);
}

function schedule(entry: PollEntry, delayMs: number): void {
  if (!isEntryCurrent(entry)) return;
  entry.timer = setTimeout(() => void tick(entry), delayMs);
}

async function tick(entry: PollEntry): Promise<void> {
  if (!isEntryCurrent(entry)) return;
  entry.timer = undefined;
  const controller = new AbortController();
  entry.controller = controller;
  try {
    const task = await taskApi.detail(entry.taskId, controller.signal);
    if (!isEntryCurrent(entry)) return;
    entry.controller = undefined;
    if (!matchesExpectedTask(task, entry) || !nodeStillExpectsTask(entry)) {
      cancelNodeTaskPoll(entry.nodeId);
      return;
    }

    entry.failures = 0;
    entry.reconnectNoticeShown = false;
    applyLiveTask(entry.nodeId, task);
    if (isTerminal(task.status)) {
      cancelNodeTaskPoll(entry.nodeId);
      return;
    }
    schedule(entry, BASE_POLL_MS);
  } catch (error) {
    entry.controller = undefined;
    if (!isEntryCurrent(entry) || isAbortError(error)) return;
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      toast.error(error.message);
      cancelNodeTaskPoll(entry.nodeId);
      return;
    }

    // Transport failures do not change the business task state. Keep the task
    // id and reconnect with capped exponential backoff.
    entry.failures += 1;
    if (entry.failures >= RECONNECT_NOTICE_AFTER && !entry.reconnectNoticeShown) {
      entry.reconnectNoticeShown = true;
      toast.warning('任务仍在服务端运行，进度连接正在重试');
    }
    const exponential = Math.min(BASE_POLL_MS * 2 ** Math.min(entry.failures, 4), MAX_BACKOFF_MS);
    const jitter = Math.round(exponential * 0.15 * Math.random());
    schedule(entry, exponential + jitter);
  }
}

function isEntryCurrent(entry: PollEntry): boolean {
  return (
    polls.get(entry.nodeId) === entry &&
    isNodeSubmissionCurrent(entry.nodeId, entry.projectId, entry.generation)
  );
}

function matchesExpectedTask(task: TaskRecord, entry: PollEntry): boolean {
  return (
    task.id === entry.taskId &&
    task.project_id === entry.projectId &&
    task.source_node_id === entry.nodeId
  );
}

function nodeStillExpectsTask(entry: PollEntry): boolean {
  const state = useCanvasStore.getState();
  if (state.projectId !== entry.projectId) return false;
  const node = state.nodes.find((candidate) => candidate.id === entry.nodeId);
  return node?.data.task_id === entry.taskId;
}

function applyLiveTask(nodeId: string, task: TaskRecord): void {
  const patch: Partial<CanvasNodeData> = { status: task.status };
  if (task.status === 'succeeded') {
    if (task.text_output != null) patch.output_text = task.text_output;
    if (task.output_asset_ids[0]) patch.output_asset_id = task.output_asset_ids[0];
  }
  useCanvasStore.getState().patchNodeData(nodeId, patch);
}

function isTerminal(status: TaskRecord['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
