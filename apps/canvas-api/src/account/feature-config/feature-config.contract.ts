import type { TaskType } from '@xgcanvas/shared-types';

/**
 * Code-owned feature contracts. A feature must be added here before it can
 * persist a model chain, so callers and admin input cannot redefine the
 * capability the feature actually consumes.
 */
export const FEATURE_REQUIRED_TASK_TYPES = {
  'ai-analysis': 'gen.text',
  agent: 'gen.text',
  'script-extract': 'gen.text',
} as const satisfies Record<string, TaskType>;

export function featureRequiredTaskType(featureKey: string): TaskType | null {
  return Object.prototype.hasOwnProperty.call(FEATURE_REQUIRED_TASK_TYPES, featureKey)
    ? FEATURE_REQUIRED_TASK_TYPES[featureKey as keyof typeof FEATURE_REQUIRED_TASK_TYPES]
    : null;
}
