import type { ChannelRouteSnapshot, ModelRevisionPin } from '@xgcanvas/shared-types';

export interface CancelRequestDto extends ModelRevisionPin {
  task_id: string;
  external_task_id: string;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  channel_resource_uid: string;
  channel_revision_id: string;
  channel_route: ChannelRouteSnapshot;
  credential_id: string;
}
