import type { ModelRevisionPin } from '@xgcanvas/shared-types';
import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';
import type { Task } from '../database/entities';

export function requireTaskModelPin(task: Task): ModelRevisionPin {
  if (!task.model_resource_uid || !task.model_revision_id || task.catalog_epoch == null) {
    throw new AdapterError({
      code: ERROR_CODES.CATALOG_REVISION_MISSING,
      message: `task ${task.id} has no resolved Catalog model revision`,
      retryable: false,
    });
  }
  return {
    model_resource_uid: task.model_resource_uid,
    model_revision_id: task.model_revision_id,
    rate_card_revision_id: task.rate_card_revision_id,
    catalog_epoch: String(task.catalog_epoch),
  };
}
