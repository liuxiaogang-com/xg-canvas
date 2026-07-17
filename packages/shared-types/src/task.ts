/**
 * Task lifecycle types shared between canvas-api / account-api / canvas-web.
 * Spec: docs/task-lifecycle.md.
 *
 * Tasks are the single source of truth for any long-running work
 * (generation / extraction / pipeline step). A task row exists before
 * the first external call and is updated by status transitions only.
 */

export const TASK_STATUSES = [
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Task types map 1:1 to a node action. The `<domain>.<verb>` shape keeps
 * the registry searchable. New types must also appear in node-spec.md.
 */
export const TASK_TYPES = [
  // generation
  'gen.text',
  'gen.image',
  'gen.video',
  'gen.audio',
  // image edit / variants
  'image.edit',
  'image.outpaint',
  'image.bg_remove',
  'image.split_layers',
  'image.split_grid',
  'image.crop',
  'image.upscale',
  'image.view_change',
  // video
  'video.split_shots',
  'video.upscale',
  'video.frame_capture',
  // audio
  'audio.transcribe',
  // script pipeline
  'script.optimize',
  'script.extract_characters',
  'script.extract_scenes',
  'script.extract_props',
  'script.generate_storyboard',
  // entity assets
  'entity.generate_image',
  // storyboard
  'storyboard.generate_image',
  'storyboard.generate_video',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface TaskInput {
  /** Domain object id, e.g. node id, script id. */
  source_id?: string;
  /** Caller-provided params, validated by constraint-engine before invoke. */
  params: Record<string, unknown>;
  /** Canonical Catalog model_id selected before the Task is created. */
  model_id: string;
}

export interface TaskError {
  code: string;
  message: string;
  /** Vendor raw payload, kept for debugging. Never shown to end users. */
  vendor?: unknown;
  retryable?: boolean;
}

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  model_id: string;
  project_id: string | null;
  source_node_id: string | null;
  workspace_id: string;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
  output_asset_ids: string[];
  text_output: string | null;
  json_output: unknown;
  progress: number | null;
  /** Public errors intentionally exclude vendor payloads and retry metadata. */
  error: Pick<TaskError, 'code' | 'message'> | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

export function isTerminalStatus(s: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(s);
}
