import { useState } from 'react';

import { Modal, toast } from '../../ui';
import { Badge, Loading } from '../components/kit';
import { providerApi } from '../api';
import type { VendorModel } from '../types';

/** "拉取模型" — fetch the provider's live /models list and enable selected ones as
 *  manual model definitions. Self-contained: a button that opens its own modal. */
export function VendorModelImport({ providerId, onImported }: { providerId: string; onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<VendorModel[] | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    setModels(null);
    setNote(undefined);
    setPicked(new Set());
    try {
      const r = await providerApi.vendorModels(providerId);
      setModels(r.models);
      setNote(r.note);
    } catch (e) {
      toast.error((e as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
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
      const r = await providerApi.importModels(providerId, ids);
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
      <button type="button" className="btn btn--secondary btn--sm" onClick={openModal}>
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
            <button type="button" className="btn btn--primary" disabled={busy || picked.size === 0} onClick={doImport}>
              {busy ? '处理中…' : `启用所选 (${picked.size})`}
            </button>
          </>
        }
      >
        {loading ? (
          <Loading label="拉取中…" />
        ) : note ? (
          <div className="set-stat__sub">{note}</div>
        ) : !models || models.length === 0 ? (
          <div className="set-stat__sub">厂商未返回模型</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 380, overflow: 'auto' }}>
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
        )}
      </Modal>
    </>
  );
}
