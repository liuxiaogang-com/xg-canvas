import type { TaskType } from '@xgcanvas/shared-types';

export interface FeatureModelCapability {
  resource_uid: string;
  task_types: readonly TaskType[];
}

export function supportsFeatureTaskType(
  model: FeatureModelCapability,
  requiredTaskType: TaskType,
): boolean {
  return model.task_types.includes(requiredTaskType);
}

export function incompatibleFeatureModelUids(
  selectedResourceUids: readonly string[],
  models: readonly FeatureModelCapability[],
  requiredTaskType: TaskType,
): string[] {
  const modelsByUid = new Map(models.map((model) => [model.resource_uid, model]));
  return selectedResourceUids.filter((resourceUid) => {
    const model = modelsByUid.get(resourceUid);
    return !model || !supportsFeatureTaskType(model, requiredTaskType);
  });
}
