import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUILTIN_ADAPTER_CAPABILITIES } from '@xgcanvas/shared-types';
import type { TaskType } from '@xgcanvas/shared-types';
import { Modal, Select, toast } from '../../ui';
import { ErrorNote, Field, Loading, TextInput } from '../components/kit';
import { channelApi, modelApi } from '../api';
import {
  buildLocalModelInput,
  compatibleChannelsForAdapter,
  pruneIncompatibleChannelUids,
  unsafeTemplateReason,
  type LocalModelDraft,
} from '../local-model-create';
import type { Channel, ModelInvocationMode, Provider } from '../types';

interface Props {
  open: boolean;
  providers: readonly Provider[];
  onClose: () => void;
}

const EMPTY_DRAFT: LocalModelDraft = {
  provider_resource_uid: '',
  adapter_key: '',
  allowed_channel_resource_uids: [],
  model_id: '',
  provider_model_id: '',
  display_name: '',
  task_type: '',
  invocation_mode: 'sync',
  supports_streaming: false,
};

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}

export default function CreateLocalModelModal({ open, providers, onClose }: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<LocalModelDraft>(EMPTY_DRAFT);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) return;
    setDraft(EMPTY_DRAFT);
    setChannels([]);
    setChannelsLoading(false);
    setChannelsError(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    const providerUid = draft.provider_resource_uid;
    if (!open || !providerUid) {
      setChannels([]);
      setChannelsLoading(false);
      setChannelsError(null);
      return;
    }
    let alive = true;
    setChannels([]);
    setChannelsLoading(true);
    setChannelsError(null);
    void channelApi.listByProvider(providerUid)
      .then((items) => {
        if (alive) setChannels(items);
      })
      .catch((error: unknown) => {
        if (alive) setChannelsError(errMessage(error));
      })
      .finally(() => {
        if (alive) setChannelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [draft.provider_resource_uid, open]);

  const provider = useMemo(
    () => providers.find((item) => item.resource_uid === draft.provider_resource_uid),
    [draft.provider_resource_uid, providers],
  );
  const compatibleChannels = useMemo(
    () => compatibleChannelsForAdapter(
      channels,
      draft.provider_resource_uid,
      draft.adapter_key,
    ),
    [channels, draft.adapter_key, draft.provider_resource_uid],
  );
  const adapterTaskManifest: Readonly<Record<string, readonly TaskType[]>> =
    BUILTIN_ADAPTER_CAPABILITIES;
  const declaredTaskTypes = adapterTaskManifest[draft.adapter_key] ?? [];
  const buildResult = useMemo(
    () => buildLocalModelInput(draft, provider, channels),
    [channels, draft, provider],
  );
  const adapterHasSafeTemplate = declaredTaskTypes.some(
    (taskType) => unsafeTemplateReason(draft.adapter_key, taskType) === null,
  );
  const templateWarning = draft.adapter_key && !adapterHasSafeTemplate
    ? '该 Adapter 暂无可安全生成的空模型模板，请从相近的官方模型详情页 Fork。'
    : unsafeTemplateReason(draft.adapter_key, draft.task_type);

  const selectProvider = (providerResourceUid: string) => {
    setDraft((current) => ({
      ...current,
      provider_resource_uid: providerResourceUid,
      adapter_key: '',
      task_type: '',
      allowed_channel_resource_uids: [],
    }));
  };

  const selectAdapter = (adapterKey: string) => {
    setDraft((current) => ({
      ...current,
      adapter_key: adapterKey,
      task_type: '',
      allowed_channel_resource_uids: pruneIncompatibleChannelUids(
        current.allowed_channel_resource_uids,
        channels,
        current.provider_resource_uid,
        adapterKey,
      ),
    }));
  };

  const toggleChannel = (resourceUid: string) => {
    setDraft((current) => ({
      ...current,
      allowed_channel_resource_uids: current.allowed_channel_resource_uids.includes(resourceUid)
        ? current.allowed_channel_resource_uids.filter((uid) => uid !== resourceUid)
        : [...current.allowed_channel_resource_uids, resourceUid],
    }));
  };

  const selectInvocationMode = (invocationMode: ModelInvocationMode) => {
    setDraft((current) => ({
      ...current,
      invocation_mode: invocationMode,
      supports_streaming: invocationMode === 'stream' || current.supports_streaming,
    }));
  };

  const submit = async () => {
    const result = buildLocalModelInput(draft, provider, channels);
    if (!result.ok) {
      toast.warning(result.reason);
      return;
    }
    setSubmitting(true);
    try {
      const created = await modelApi.create(result.input);
      toast.success('本地模型已创建，默认保持停用，请在详情页复核后启用');
      onClose();
      navigate(`/settings/models/${created.resource_uid}`);
    } catch (error: unknown) {
      toast.error(errMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (!submitting) onClose();
  };

  const footer = (
    <>
      <button type="button" className="btn btn--ghost" onClick={close} disabled={submitting}>
        取消
      </button>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => void submit()}
        disabled={!buildResult.ok || channelsLoading || submitting}
      >
        {submitting ? '创建中…' : '创建本地模型'}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title="新建本地模型" width={640} footer={footer}>
      <Field label="供应商">
        <Select<string>
          value={draft.provider_resource_uid || undefined}
          placeholder="请选择供应商"
          options={providers.map((item) => ({
            value: item.resource_uid,
            label: item.display_name,
          }))}
          onChange={selectProvider}
        />
      </Field>

      <Field label="Adapter" hint="协议行为来自代码 Adapter，必须由供应商和渠道同时明确声明。">
        <Select<string>
          value={draft.adapter_key || undefined}
          placeholder="请选择 Adapter"
          disabled={!provider}
          options={(provider?.adapter_keys ?? []).map((adapterKey) => ({
            value: adapterKey,
            label: adapterKey,
          }))}
          onChange={selectAdapter}
        />
      </Field>

      <Field label="任务类型">
        <Select<TaskType>
          value={draft.task_type || undefined}
          placeholder="请选择任务类型"
          disabled={!draft.adapter_key || !adapterHasSafeTemplate}
          options={declaredTaskTypes.map((taskType) => {
            const unsupported = unsafeTemplateReason(draft.adapter_key, taskType) !== null;
            return {
              value: taskType,
              label: unsupported ? `${taskType}（请从官方模型 Fork）` : taskType,
              disabled: unsupported,
            };
          })}
          onChange={(taskType) => setDraft((current) => ({ ...current, task_type: taskType }))}
        />
      </Field>
      {templateWarning ? <div className="set-error">{templateWarning}</div> : null}

      <div className="field">
        <span className="field__label">兼容渠道（至少一个）</span>
        {channelsLoading ? <Loading label="加载渠道…" /> : null}
        {channelsError ? <ErrorNote message={channelsError} /> : null}
        {!channelsLoading && !channelsError && draft.adapter_key && compatibleChannels.length === 0 ? (
          <span className="field__hint">该供应商没有声明当前 Adapter 的渠道，请先到供应商详情创建渠道。</span>
        ) : null}
        <div className="set-model-pool">
          {compatibleChannels.map((channel) => (
            <label key={channel.resource_uid} className="set-filter-check">
              <input
                type="checkbox"
                checked={draft.allowed_channel_resource_uids.includes(channel.resource_uid)}
                onChange={() => toggleChannel(channel.resource_uid)}
              />
              {channel.display_name}{channel.enabled ? '' : '（当前停用）'}
            </label>
          ))}
        </div>
      </div>

      <Field label="model_id" hint="Catalog 内公开且创建后不可修改的稳定标识，例如 my-provider:chat-pro。">
        <TextInput
          value={draft.model_id}
          placeholder="my-provider:chat-pro"
          onChange={(event) => setDraft((current) => ({ ...current, model_id: event.target.value }))}
        />
      </Field>
      <Field label="上游模型 ID">
        <TextInput
          value={draft.provider_model_id}
          placeholder="chat-pro"
          onChange={(event) => setDraft((current) => ({ ...current, provider_model_id: event.target.value }))}
        />
      </Field>
      <Field label="显示名称">
        <TextInput
          value={draft.display_name}
          placeholder="Chat Pro"
          onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))}
        />
      </Field>

      <Field label="调用模式">
        <Select<ModelInvocationMode>
          value={draft.invocation_mode}
          options={[
            { value: 'sync', label: 'sync' },
            { value: 'stream', label: 'stream' },
            { value: 'async', label: 'async（当前空模板不支持）', disabled: true },
          ]}
          onChange={selectInvocationMode}
        />
      </Field>
      <div className="field">
        <span className="field__label">流式能力</span>
        <label className="set-filter-check">
          <input
            type="checkbox"
            checked={draft.supports_streaming}
            disabled={draft.invocation_mode === 'stream'}
            onChange={(event) => setDraft((current) => ({
              ...current,
              supports_streaming: event.target.checked,
            }))}
          />
          supports_streaming（stream 模式下固定启用）
        </label>
      </div>
    </Modal>
  );
}
