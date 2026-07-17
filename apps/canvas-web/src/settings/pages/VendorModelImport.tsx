import { useState } from 'react';

import { Modal, Select, toast } from '../../ui';
import { Badge, Loading } from '../components/kit';
import { providerApi } from '../api';
import type { Channel, VendorModel } from '../types';

/** Fetch a provider's live /models list and create selected Local Catalog Resources. */
export function VendorModelImport({
  providerResourceUid,
  channels,
  onImported,
}: {
  providerResourceUid: string;
  channels: Channel[];
  onImported?: () => void;
}) {
  const compatibleChannels = channels.filter((channel) =>
    channel.adapter_keys.includes('openai-compat'),
  );
  const [open, setOpen] = useState(false);
  const [channelResourceUid, setChannelResourceUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<VendorModel[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [contractConfirmed, setContractConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadModels = async (nextChannelResourceUid: string) => {
    setOpen(true);
    setChannelResourceUid(nextChannelResourceUid);
    setLoading(true);
    setModels(null);
    setNote(undefined);
    setPicked(new Set());
    setContractConfirmed(false);
    try {
      const r = await providerApi.vendorModels(
        providerResourceUid,
        nextChannelResourceUid,
        'openai-text-chat-stream',
      );
      setModels(r.models);
      setNote(r.note);
    } catch (e) {
      toast.error((e as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    const initial = compatibleChannels[0]?.resource_uid;
    if (!initial) return;
    void loadModels(initial);
  };

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const doImport = async () => {
    const ids = [...picked];
    if (!ids.length) {
      toast.warning('请先勾选模型');
      return;
    }
    setBusy(true);
    try {
      if (!contractConfirmed) {
        toast.warning('请先确认所选模型的调用契约');
        return;
      }
      const r = await providerApi.importModels(
        providerResourceUid,
        channelResourceUid,
        ids,
        'openai-text-chat-stream',
      );
      toast.success(`已启用 ${r.created.length} 个模型${r.skipped.length ? `，跳过 ${r.skipped.length} 个` : ''}`);
      setOpen(false);
      onImported?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={openModal}
        disabled={compatibleChannels.length === 0}
        title={compatibleChannels.length === 0 ? '没有 OpenAI-compatible 渠道' : undefined}
      >
        拉取模型
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="拉取厂商模型"
        width={520}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || picked.size === 0 || !contractConfirmed}
              onClick={doImport}
            >
              {busy ? '处理中…' : `启用所选 (${picked.size})`}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div className="field__hint">模型会绑定到所选的明确渠道</div>
          <Select
            value={channelResourceUid}
            options={compatibleChannels.map((channel) => ({
              value: channel.resource_uid,
              label: `${channel.display_name} (${channel.slug})`,
            }))}
            onChange={(value) => void loadModels(value)}
          />
        </div>
        {loading ? (
          <Loading label="拉取中…" />
        ) : note ? (
          <div className="set-stat__sub">{note}</div>
        ) : !models || models.length === 0 ? (
          <div className="set-stat__sub">厂商未返回模型</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="field__hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={contractConfirmed}
                onChange={(event) => setContractConfirmed(event.target.checked)}
              />
              <span>
                我确认所选 ID 是兼容 OpenAI Chat Completions 的流式文本模型。厂商
                <code>/models</code> 只返回 ID，无法自动判断图片、音频、Embedding 或流式能力。
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 330, overflow: 'auto' }}>
            {models.map((m) => (
              <label
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-subtle)',
                  cursor: m.imported ? 'default' : 'pointer',
                  opacity: m.imported ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  disabled={m.imported}
                  checked={m.imported || picked.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>{m.id}</span>
                {m.imported ? <Badge tone="success">已启用</Badge> : null}
              </label>
            ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
