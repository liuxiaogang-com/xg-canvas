import type { UnifiedRequest, UnifiedResponse } from '@xgcanvas/adapters-contract';
import type { ChannelRouteSnapshot } from '@xgcanvas/shared-types';
import type { InvokeRequestDto } from './dto/invoke-request.dto';

export interface InvokeLogDimensions {
  source: 'invoke';
  operation: string | null;
  workspace_id: string | null;
  owner_id: string | null;
  project_id: string | null;
  task_id: string | null;
  model_id: string | null;
  model_resource_uid: string | null;
  model_revision_id: string | null;
  rate_card_revision_id: string | null;
  catalog_epoch: string | null;
  provider_slug: string | null;
  adapter_key: string | null;
  channel_resource_uid: string | null;
  channel_revision_id: string | null;
  channel_route: ChannelRouteSnapshot | null;
  credential_id: string | null;
  credential_label: string | null;
  request_summary: Record<string, unknown> | null;
  request_body: unknown;
}

export function newInvokeLogDimensions(dto: InvokeRequestDto): InvokeLogDimensions {
  return {
    source: 'invoke',
    operation: (dto.task_type as string) ?? null,
    workspace_id: dto.workspace_id ?? null,
    owner_id: dto.owner_id ?? null,
    project_id: dto.project_id ?? null,
    task_id: dto.task_id ?? null,
    model_id: (dto.model_id as string) ?? null,
    model_resource_uid:
      dto.resolution.kind === 'pinned' ? dto.resolution.pin.model_resource_uid : null,
    model_revision_id:
      dto.resolution.kind === 'pinned' ? dto.resolution.pin.model_revision_id : null,
    rate_card_revision_id:
      dto.resolution.kind === 'pinned' ? dto.resolution.pin.rate_card_revision_id : null,
    catalog_epoch: dto.resolution.kind === 'pinned' ? dto.resolution.pin.catalog_epoch : null,
    provider_slug: null,
    adapter_key: null,
    channel_resource_uid: null,
    channel_revision_id: null,
    channel_route: null,
    credential_id: null,
    credential_label: null,
    request_summary: null,
    request_body: null,
  };
}

export function summarizeRequest(req: UnifiedRequest): Record<string, unknown> {
  const p = req.params as Record<string, unknown>;
  return {
    provider_model: req.provider_model,
    task_type: req.task_type,
    stream: !!req.stream,
    temperature: p.temperature ?? null,
    max_tokens: p.max_tokens ?? null,
    thinking: p.thinking ?? null,
    json_mode: p.json_mode ?? null,
    message_count: req.inputs.messages?.length ?? null,
  };
}

/** Preserve only usage explicitly reported by the vendor/adapter. */
export function billableUsage(
  _req: UnifiedRequest,
  res: UnifiedResponse,
): Record<string, unknown> | null {
  const usage = { ...((res.usage as Record<string, unknown> | undefined) ?? {}) };
  return Object.keys(usage).length > 0 ? usage : null;
}
