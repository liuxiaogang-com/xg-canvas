import type { Capability, TaskType } from '@xgcanvas/shared-types';
import type { CreateModelInput } from './api';
import type { Channel, ModelInvocationMode, Provider } from './types';

export interface LocalModelDraft {
  provider_resource_uid: string;
  adapter_key: string;
  allowed_channel_resource_uids: string[];
  model_id: string;
  provider_model_id: string;
  display_name: string;
  task_type: TaskType | '';
  invocation_mode: ModelInvocationMode;
  supports_streaming: boolean;
}

export type LocalModelBuildResult =
  | { ok: true; input: CreateModelInput }
  | { ok: false; reason: string };

export function compatibleChannelsForAdapter(
  channels: readonly Channel[],
  providerResourceUid: string,
  adapterKey: string,
): Channel[] {
  if (!providerResourceUid || !adapterKey) return [];
  return channels.filter((channel) =>
    channel.provider_resource_uid === providerResourceUid
    && channel.adapter_keys.includes(adapterKey)
  );
}

export function pruneIncompatibleChannelUids(
  selectedUids: readonly string[],
  channels: readonly Channel[],
  providerResourceUid: string,
  adapterKey: string,
): string[] {
  const compatible = new Set(
    compatibleChannelsForAdapter(channels, providerResourceUid, adapterKey)
      .map((channel) => channel.resource_uid),
  );
  return [...new Set(selectedUids)].filter((uid) => compatible.has(uid));
}

export function unsafeTemplateReason(adapterKey: string, taskType: TaskType | ''): string | null {
  if (!adapterKey || !taskType) return null;
  if (adapterKey === 'openai-compat' && taskType === 'gen.text') return null;
  return '当前只提供 OpenAI-compatible 文本模型的安全空模板；其他协议或任务请从相近的官方模型 Fork。';
}

function capabilitiesForText(supportsStreaming: boolean): Capability[] {
  return supportsStreaming ? ['text_chat', 'streaming'] : ['text_chat'];
}

export function buildLocalModelInput(
  draft: LocalModelDraft,
  provider: Provider | undefined,
  channels: readonly Channel[],
): LocalModelBuildResult {
  if (!provider || provider.resource_uid !== draft.provider_resource_uid) {
    return { ok: false, reason: '请选择供应商' };
  }
  if (!draft.adapter_key || !provider.adapter_keys.includes(draft.adapter_key)) {
    return { ok: false, reason: '请选择该供应商明确声明的 Adapter' };
  }
  if (!draft.task_type) return { ok: false, reason: '请选择任务类型' };
  const unsafeReason = unsafeTemplateReason(draft.adapter_key, draft.task_type);
  if (unsafeReason) return { ok: false, reason: unsafeReason };
  if (draft.invocation_mode === 'async') {
    return {
      ok: false,
      reason: 'OpenAI-compatible 空模板只支持 sync 或 stream；异步模型请从官方模型 Fork。',
    };
  }

  const modelId = draft.model_id.trim();
  const providerModelId = draft.provider_model_id.trim();
  const displayName = draft.display_name.trim();
  if (!modelId || !providerModelId || !displayName) {
    return { ok: false, reason: '请填写 model_id、上游模型 ID 和显示名称' };
  }

  const allowedChannelUids = pruneIncompatibleChannelUids(
    draft.allowed_channel_resource_uids,
    channels,
    provider.resource_uid,
    draft.adapter_key,
  );
  if (allowedChannelUids.length !== new Set(draft.allowed_channel_resource_uids).size) {
    return { ok: false, reason: '所选渠道与当前 Provider/Adapter 不兼容，请重新选择' };
  }
  if (allowedChannelUids.length === 0) {
    return { ok: false, reason: '请至少选择一个兼容渠道' };
  }

  const supportsStreaming = draft.supports_streaming || draft.invocation_mode === 'stream';
  return {
    ok: true,
    input: {
      provider_resource_uid: provider.resource_uid,
      model_id: modelId,
      provider_model_id: providerModelId,
      display_name: displayName,
      task_types: [draft.task_type],
      capabilities: capabilitiesForText(supportsStreaming),
      invocation_mode: draft.invocation_mode,
      supports_streaming: supportsStreaming,
      adapter_key: draft.adapter_key,
      allowed_channel_resource_uids: allowedChannelUids,
      param_schema: {
        version: '1.0',
        groups: [],
        properties: {},
        required: [],
        defaults: {},
      },
      param_constraints: [],
    },
  };
}
