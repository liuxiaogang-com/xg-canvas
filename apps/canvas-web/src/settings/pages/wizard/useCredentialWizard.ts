import { useEffect, useMemo, useState } from 'react';

import { toast } from '../../../ui';
import { credentialApi, providerApi } from '../../api';
import type {
  CredentialCatalogChannel,
  CredentialCatalogModel,
  CredentialCatalogProvider,
  VendorModel,
} from '../../types';
import { modalitiesOf, modalityOfTaskType, type Modality } from './modality';
import type { PickItem } from './ModelPicklist';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败';

interface UseCredentialWizardOptions {
  open: boolean;
  initialModality: Modality | null;
  providers: CredentialCatalogProvider[];
  channels: CredentialCatalogChannel[];
  models: CredentialCatalogModel[];
  onSaved: () => void;
  onClose: () => void;
}

export function useCredentialWizard({
  open,
  initialModality,
  providers,
  channels,
  models,
  onSaved,
  onClose,
}: UseCredentialWizardOptions) {
  const [providerResourceUid, setProviderResourceUid] = useState('');
  const [channelResourceUid, setChannelResourceUid] = useState('');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modalities, setModalities] = useState<Set<Modality>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [vendorModels, setVendorModels] = useState<VendorModel[] | null>(null);
  const [vendorContractConfirmed, setVendorContractConfirmed] = useState(false);
  const [probeNote, setProbeNote] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  const provider = providers.find((item) => item.resource_uid === providerResourceUid) ?? null;
  const providerChannels = useMemo(
    () => channels.filter((item) => item.provider_resource_uid === providerResourceUid),
    [channels, providerResourceUid],
  );
  const channel = providerChannels.find((item) => item.resource_uid === channelResourceUid) ?? null;
  const isApiKey = provider?.auth_method === 'api_key';
  const isCliLogin = provider?.auth_method === 'cli_login' &&
    provider.adapter_keys.includes('dreamina-cli') &&
    Boolean(channel?.adapter_keys.includes('dreamina-cli'));
  const supportedAuth = isApiKey || isCliLogin;
  const supportsProbe = isApiKey && Boolean(channel?.adapter_keys.includes('openai-compat'));

  const presetModels = useMemo(
    () => models
      .filter((model) =>
        model.provider_resource_uid === providerResourceUid && model.origin.kind === 'official')
      .filter((model) =>
        Boolean(channel) &&
        model.allowed_channel_resource_uids.includes(channelResourceUid) &&
        channel?.adapter_keys.includes(model.adapter_key)),
    [channel, channelResourceUid, models, providerResourceUid],
  );
  const availableModalities = useMemo(
    () => modalitiesOf(presetModels.flatMap((model) => model.task_types ?? [])),
    [presetModels],
  );
  const visiblePresetModels = useMemo(
    () => presetModels.filter((model) =>
      (model.task_types ?? []).some((taskType) => modalities.has(modalityOfTaskType(taskType)))),
    [modalities, presetModels],
  );

  const items: PickItem[] = useMemo(() => {
    const presets: PickItem[] = visiblePresetModels.map((model) => ({
      key: `p:${model.resource_uid}`,
      title: model.display_name || model.model_id,
      sub: model.model_id,
      badge: model.enabled
        ? { text: '已启用', tone: 'success' }
        : { text: '预置', tone: 'default' },
      disabled: model.enabled,
    }));
    const knownModelIds = new Set(
      presetModels.flatMap((model) => [model.model_id, model.provider_model_id]),
    );
    const vendorItems: PickItem[] = (vendorModels ?? [])
      .filter((model) => !knownModelIds.has(model.id))
      .map((model) => ({
        key: `v:${model.id}`,
        title: model.id,
        sub: '厂商拉取',
        badge: model.imported
          ? { text: '已导入', tone: 'success' }
          : { text: '新', tone: 'accent' },
        disabled:
          model.imported ||
          !vendorContractConfirmed ||
          !channel?.adapter_keys.includes('openai-compat'),
      }));
    return [...presets, ...vendorItems];
  }, [channel, presetModels, vendorContractConfirmed, vendorModels, visiblePresetModels]);

  useEffect(() => {
    if (!open) return;
    setProviderResourceUid('');
    setChannelResourceUid('');
    setLabel('');
    setApiKey('');
  }, [open]);

  useEffect(() => {
    if (!providers.some((item) => item.resource_uid === providerResourceUid)) {
      setProviderResourceUid(providers[0]?.resource_uid ?? '');
    }
  }, [providerResourceUid, providers]);

  useEffect(() => {
    if (!providerChannels.some((item) => item.resource_uid === channelResourceUid)) {
      setChannelResourceUid(providerChannels[0]?.resource_uid ?? '');
    }
  }, [channelResourceUid, providerChannels]);

  useEffect(() => {
    if (initialModality && availableModalities.includes(initialModality)) {
      setModalities(new Set([initialModality]));
    } else {
      setModalities(new Set(availableModalities));
    }
    setPicked(new Set());
    setVendorModels(null);
    setVendorContractConfirmed(false);
    setProbeNote(null);
  }, [availableModalities, initialModality, presetModels]);

  const toggleModality = (modality: Modality) => {
    setModalities((current) => {
      const next = new Set(current);
      if (next.has(modality)) next.delete(modality);
      else next.add(modality);
      return next;
    });
  };

  const toggleModel = (key: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmVendorContract = (confirmed: boolean) => {
    setVendorContractConfirmed(confirmed);
    if (!confirmed) {
      setPicked((current) => new Set(
        [...current].filter((key) => !key.startsWith('v:')),
      ));
    }
  };

  const probe = async () => {
    if (!providerResourceUid || !channelResourceUid || !apiKey.trim()) {
      toast.warning('请先选择渠道并填写 API Key');
      return;
    }
    setProbing(true);
    setProbeNote(null);
    try {
      const response = await providerApi.probeModels(
        providerResourceUid,
        channelResourceUid,
        apiKey.trim(),
        'openai-text-chat-stream',
      );
      setVendorModels(response.models);
      setProbeNote(response.note ?? (response.models.length ? null : '厂商未返回模型'));
    } catch (error) {
      setVendorModels(null);
      setProbeNote(errorMessage(error));
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    if (!providerResourceUid || !channelResourceUid || !supportedAuth) return;
    if (!isCliLogin && !apiKey.trim()) {
      toast.warning('请填写 API Key');
      return;
    }
    setSaving(true);
    try {
      const keys = [...picked];
      const vendorModelIds = keys
        .filter((key) => key.startsWith('v:'))
        .map((key) => key.slice(2));
      const presetModelResourceUids = keys
        .filter((key) => key.startsWith('p:'))
        .map((key) => key.slice(2));
      if (vendorModelIds.length && !vendorContractConfirmed) {
        toast.warning('请先确认厂商模型的调用契约');
        return;
      }
      await credentialApi.addKey({
        provider_resource_uid: providerResourceUid,
        channel_resource_uid: channelResourceUid,
        label: label.trim() || undefined,
        payload: isCliLogin ? {} : { api_key: apiKey.trim() },
        vendor_model_ids: vendorModelIds.length ? vendorModelIds : undefined,
        vendor_model_profile: vendorModelIds.length ? 'openai-text-chat-stream' : undefined,
        preset_model_resource_uids: presetModelResourceUids.length
          ? presetModelResourceUids
          : undefined,
      });
      toast.success(`已保存凭证${keys.length ? `,启用 ${keys.length} 个模型` : ''}`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return {
    providers,
    provider,
    providerResourceUid,
    setProviderResourceUid,
    providerChannels,
    channel,
    channelResourceUid,
    setChannelResourceUid,
    label,
    setLabel,
    apiKey,
    setApiKey,
    modalities,
    availableModalities,
    toggleModality,
    isApiKey,
    isCliLogin,
    supportedAuth,
    supportsProbe,
    probe,
    probing,
    probeNote,
    vendorModels,
    vendorContractConfirmed,
    confirmVendorContract,
    items,
    picked,
    toggleModel,
    saving,
    save,
  };
}

export type CredentialWizardController = ReturnType<typeof useCredentialWizard>;
