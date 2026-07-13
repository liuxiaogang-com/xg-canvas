/* 配置同步 — port of account-admin/src/pages/ConfigSync.tsx onto the dark kit.
 * Loads sync status on mount; offers "同步 YAML 到数据库" and "重载注册表"
 * actions; renders the resulting SyncResult as stat cards + error list. */
import { useEffect, useState } from 'react';
import { SettingsPage, StatCard, Loading, ErrorNote } from '../components/kit';
import { toast } from '../../ui';
import { configSyncApi } from '../api';
import type { ConfigSyncStatus, SyncResult } from '../types';

type Section = SyncResult['providers'];

const SECTIONS: { key: keyof Omit<SyncResult, 'errors'>; label: string }[] = [
  { key: 'providers', label: '提供商' },
  { key: 'channels', label: '渠道' },
  { key: 'models', label: '模型' },
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN');
}

function SectionCard({ label, data }: { label: string; data: Section }) {
  return (
    <StatCard
      label={label}
      value={
        <span style={{ display: 'flex', gap: 12, fontSize: 16 }}>
          <span style={{ color: 'var(--color-success, #4ade80)' }}>+{data.created}</span>
          <span style={{ color: 'var(--color-accent, #60a5fa)' }}>~{data.updated}</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>={data.skipped}</span>
        </span>
      }
      sub="新建 / 更新 / 跳过"
    />
  );
}

export default function ConfigSync() {
  const [status, setStatus] = useState<ConfigSyncStatus | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reloading, setReloading] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await configSyncApi.status();
      setStatus(s);
      if (s.last_result) setResult(s.last_result);
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleSync() {
    if (!window.confirm('确认同步？将从 YAML 文件更新数据库中的配置。')) return;
    setSyncing(true);
    setResult(null);
    try {
      const r = await configSyncApi.sync();
      setResult(r);
      if (r.errors.length) toast.warning(`同步完成，但有 ${r.errors.length} 个错误`);
      else toast.success('同步完成');
      void loadStatus();
    } catch (e) {
      toast.error('同步失败: ' + errMsg(e));
    } finally {
      setSyncing(false);
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const r = await configSyncApi.reloadRegistry();
      toast.success(`注册表已重载: ${r.loaded} 个模型`);
    } catch (e) {
      toast.error('重载失败: ' + errMsg(e));
    } finally {
      setReloading(false);
    }
  }

  const actions = (
    <>
      <button
        className="btn btn--primary"
        onClick={handleSync}
        disabled={syncing || reloading}
      >
        {syncing ? '同步中…' : '同步 YAML 到数据库'}
      </button>
      <button
        className="btn btn--secondary"
        onClick={handleReload}
        disabled={syncing || reloading}
      >
        {reloading ? '重载中…' : '重载注册表'}
      </button>
    </>
  );

  return (
    <SettingsPage
      title="配置同步"
      description="把 config/ 下的 YAML 模型清单同步进数据库并重载内存注册表"
      actions={actions}
    >
      {loading ? (
        <Loading />
      ) : loadError ? (
        <ErrorNote message={loadError} />
      ) : (
        <>
          <div className="set-detail-grid">
            <dt>配置路径</dt>
            <dd>
              <code>config/model-providers/*.yaml</code>
            </dd>
            <dt>上次同步</dt>
            <dd>{fmtTime(status?.last_sync_at ?? null)}</dd>
            <dt>同步状态</dt>
            <dd>{syncing || status?.syncing ? '进行中…' : '空闲'}</dd>
          </div>

          {syncing ? <Loading label="同步中…" /> : null}

          {result ? (
            <>
              <div className="set-section-title">同步结果</div>
              <div className="set-stats">
                {SECTIONS.map((s) => (
                  <SectionCard key={s.key} label={s.label} data={result[s.key]} />
                ))}
              </div>
              {result.errors.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="set-section-title">
                    错误 ({result.errors.length})
                  </div>
                  {result.errors.map((msg, i) => (
                    <ErrorNote key={i} message={msg} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}
