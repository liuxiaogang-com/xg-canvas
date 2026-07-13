/* 接入供应商 / 添加凭证 — credential-centric wizard.
 * 依次:选供应商、勾选功能(来自该供应商预置模型的 modality 并集,默认全选)、
 * 选要启用的模型(预置清单,可用「一键获取」补充厂商模型)、填 key、保存。
 * 保存分流:预置模型置 enabled;厂商拉取的新模型随凭证 import 为 manual。
 * Radix Dialog + design tokens(见 wizard/credential-wizard.css)。 */
import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { Select, toast } from '../../ui';
import { TextInput, Loading } from '../components/kit';
import { credentialApi, providerApi } from '../api';
import type { VendorModel } from '../types';
import { useWizardData } from './wizard/useWizardData';
import { MODALITY_LABEL, modalitiesOf, modalityOfTaskType, type Modality } from './wizard/modality';
import { ModelPicklist, type PickItem } from './wizard/ModelPicklist';
import { DreaminaLoginPanel } from './wizard/DreaminaLoginPanel';
import WzCheckbox from './wizard/WzCheckbox';
import './wizard/credential-wizard.css';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : '操作失败');

export function AddCredentialWizard({
  open,
  onClose,
  onSaved,
  initialModality = null,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Prefer this modality when opening from readiness deep-link (?modality=). */
  initialModality?: Modality | null;
}) {
  const { providers, models, loading } = useWizardData(open);

  const [providerId, setProviderId] = useState('');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [mods, setMods] = useState<Set<Modality>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [vendor, setVendor] = useState<VendorModel[] | null>(null);
  const [probeNote, setProbeNote] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  const provider = providers.find((p) => p.id === providerId) ?? null;
  const isApiKey = (provider?.auth_method ?? 'api_key') === 'api_key';
  const isCliLogin = provider?.auth_method === 'cli_login';
  const supportsProbe = isApiKey && !!provider?.base_url;

  // preset = anything not hand-added: config-sync writes source 'config_file'
  // (legacy rows may be 'yaml'); manual imports write 'manual'.
  const presetModels = useMemo(
    () => models.filter((m) => m.provider_id === providerId && m.source !== 'manual'),
    [models, providerId],
  );
  const availModalities = useMemo(
    () => modalitiesOf(presetModels.flatMap((m) => m.task_types ?? [])),
    [presetModels],
  );

  // reset transient inputs each open
  useEffect(() => {
    if (!open) return;
    setLabel('');
    setApiKey('');
  }, [open]);

  // default provider once the list arrives
  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id);
  }, [providers, providerId]);

  // provider (or its preset set) changed: default 功能 (prefer deep-link modality), clear probe/picks
  useEffect(() => {
    if (initialModality && availModalities.includes(initialModality)) {
      setMods(new Set([initialModality]));
    } else {
      setMods(new Set(availModalities));
    }
    setPicked(new Set());
    setVendor(null);
    setProbeNote(null);
  }, [presetModels, availModalities, initialModality]);

  const visiblePreset = useMemo(
    () => presetModels.filter((m) => (m.task_types ?? []).some((t) => mods.has(modalityOfTaskType(t)))),
    [presetModels, mods],
  );

  const items: PickItem[] = useMemo(() => {
    const preset: PickItem[] = visiblePreset.map((m) => ({
      key: `p:${m.id}`,
      title: m.display_name || m.model_id,
      sub: m.model_id,
      badge: m.enabled ? { text: '已启用', tone: 'success' } : { text: '预置', tone: 'default' },
      disabled: m.enabled,
    }));
    const seen = new Set(presetModels.flatMap((m) => [m.model_id, m.provider_model_id]));
    const vend: PickItem[] = (vendor ?? [])
      .filter((v) => !seen.has(v.id))
      .map((v) => ({
        key: `v:${v.id}`,
        title: v.id,
        sub: '厂商拉取',
        badge: v.imported ? { text: '已导入', tone: 'success' } : { text: '新', tone: 'accent' },
        disabled: v.imported,
      }));
    return [...preset, ...vend];
  }, [visiblePreset, vendor, presetModels]);

  const toggleMod = (m: Modality) =>
    setMods((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  const toggle = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const probe = async () => {
    if (!providerId || !apiKey.trim()) {
      toast.warning('请先填写 API Key');
      return;
    }
    setProbing(true);
    setProbeNote(null);
    try {
      const r = await providerApi.probeModels(providerId, apiKey.trim());
      setVendor(r.models);
      setProbeNote(r.note ?? (r.models.length ? null : '厂商未返回模型'));
    } catch (e) {
      setVendor(null);
      setProbeNote(errMsg(e));
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    if (!providerId) return;
    const isCliLogin = provider?.auth_method === 'cli_login';
    if (!isCliLogin && !apiKey.trim()) {
      toast.warning('请填写 API Key');
      return;
    }
    setSaving(true);
    try {
      const keys = [...picked];
      const vendorIds = keys.filter((k) => k.startsWith('v:')).map((k) => k.slice(2));
      const presetIds = keys.filter((k) => k.startsWith('p:')).map((k) => k.slice(2));
      await credentialApi.addKey({
        provider_id: providerId,
        label: label.trim() || undefined,
        payload: isCliLogin ? {} : { api_key: apiKey.trim() },
        model_ids: vendorIds.length ? vendorIds : undefined,
        preset_model_ids: presetIds.length ? presetIds : undefined,
      });
      toast.success(`已保存凭证${keys.length ? `,启用 ${keys.length} 个模型` : ''}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="cwz-overlay" />
        <Dialog.Content
          className="cwz-content"
          aria-describedby="cwz-desc"
          onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}
        >
          <div className="cwz-head">
            <Dialog.Title className="cwz-title">接入供应商 / 添加凭证</Dialog.Title>
            <Dialog.Description id="cwz-desc" className="cwz-desc">
              依次:选供应商、勾选需要的功能、选择要启用的模型、填写凭证。
            </Dialog.Description>
          </div>

          <div className="cwz-body">
            {/* off-screen decoys soak up password-manager autofill so 备注 stays clean */}
            <input className="cwz-decoy" type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden />
            <input className="cwz-decoy" type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden />

            {loading ? (
              <Loading label="加载供应商与模型…" />
            ) : (
              <>
                <div className="cwz-field">
                  <span className="cwz-field__label">供应商</span>
                  <Select
                    value={providerId}
                    options={providers.map((p) => ({ value: p.id, label: `${p.display_name} (${p.slug})` }))}
                    onChange={setProviderId}
                    placeholder="选择供应商"
                  />
                </div>

                <div className="cwz-field">
                  <span className="cwz-field__label">备注</span>
                  <TextInput
                    value={label}
                    placeholder="便于区分,如 主账号 / A-deepseek"
                    onChange={(e) => setLabel(e.target.value)}
                    name="xgcanvas-cred-note"
                    autoComplete="off"
                  />
                </div>

                <div className="cwz-field">
                  <span className="cwz-field__label">支持的功能</span>
                  {availModalities.length ? (
                    <>
                      <div className="cwz-caps">
                        {availModalities.map((m) => (
                          <WzCheckbox key={m} checked={mods.has(m)} onCheckedChange={() => toggleMod(m)}>
                            {MODALITY_LABEL[m]}
                          </WzCheckbox>
                        ))}
                      </div>
                      <span className="cwz-field__hint">来自该供应商的预置模型,默认全选;取消即筛掉对应模型。</span>
                    </>
                  ) : (
                    <span className="cwz-field__hint">该供应商暂无预置模型,可填 key 后用「一键获取」拉取。</span>
                  )}
                </div>

                {isApiKey ? (
                  <div className="cwz-field">
                    <span className="cwz-field__label">API Key</span>
                    <div className="cwz-row">
                      <TextInput
                        type="password"
                        value={apiKey}
                        placeholder="sk-..."
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ flex: 1 }}
                        name="xgcanvas-cred-key"
                        autoComplete="new-password"
                      />
                      {supportsProbe ? (
                        <button type="button" className="btn btn--secondary btn--sm" onClick={probe} disabled={probing}>
                          {probing ? '获取中…' : '一键获取模型'}
                        </button>
                      ) : null}
                    </div>
                    {supportsProbe ? (
                      <span className="cwz-field__hint">支持从厂商 /models 拉取补充模型(如 DeepSeek);其余仅用预置清单。</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="cwz-field">
                    <DreaminaLoginPanel onLogin={() => {}} />
                  </div>
                )}

                <div className="cwz-field">
                  <span className="cwz-field__label">要启用的模型</span>
                  {probeNote ? <span className="cwz-field__hint">{probeNote}</span> : null}
                  <ModelPicklist
                    items={items}
                    picked={picked}
                    onToggle={toggle}
                    empty={availModalities.length ? '当前功能下没有模型' : '暂无模型,填 key 后可一键获取'}
                  />
                </div>
              </>
            )}
          </div>

          <div className="cwz-foot">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={save}
              disabled={saving || !providerId || (!isCliLogin && !apiKey.trim())}
            >
              {saving ? '保存中…' : `保存${picked.size ? ` (启用 ${picked.size})` : ''}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
