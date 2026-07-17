import type { ModelRevisionPin, TaskType } from '@xgcanvas/shared-types';

interface InvokeRequestBase {
  task_id: string;
  task_type: TaskType;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  params: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  channel_resource_uid?: string;
  credential_id?: string;
  stream?: boolean;
  idempotency_key?: string;
  logical_request_id?: string;
}

export type InvokeRequestDto = InvokeRequestBase &
  ({ resolution: { kind: 'current' } } | { resolution: { kind: 'pinned'; pin: ModelRevisionPin } });
