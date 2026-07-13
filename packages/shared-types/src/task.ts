/**
 * Task lifecycle types shared between canvas-api / account-api / canvas-web.
 * Spec: docs/task-lifecycle.md.
 *
 * Tasks are the single source of truth for any long-running work
 * (generation / extraction / pipeline step). A task row exists before
 * the first external call and is updated by status transitions only.
 */

export const TASK_STATUSES = [
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
  /** Optional model_id; if absent the registry default for the task_type wins. */
  model_id?: string;
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
  /** ID issued by the upstream provider, present once invoke returns. */
  external_task_id?: string;
  input: TaskInput;
  /** Asset ids produced by the task; populated on succeeded. */
  output_asset_ids: string[];
  error?: TaskError;
  attempts: number;
  /** Next time the poller is allowed to touch this task. */
  next_poll_at?: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

export function isTerminalStatus(s: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(s);
}
