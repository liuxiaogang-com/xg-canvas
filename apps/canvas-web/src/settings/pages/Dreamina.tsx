/* 即梦登录 — OAuth Device Flow. 点「即梦登录」拿 verification_uri,打开即梦授权页
 * (在已登录即梦的浏览器点「授权」),前端轮询 device_code 直到成功。取代旧的二维码
 * 流程(新版官方 CLI 已改为 device flow)。AIGC 生成需高级及以上会员。 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { SettingsPage, StatCard, BoolBadge, Badge, Loading, ErrorNote } from '../components/kit';
import { Modal, toast } from '../../ui';
import { dreaminaApi } from '../api';
import type { DreaminaStatusView, DreaminaLoginStart } from '../types';

type Phase = 'starting' | 'waiting' | 'success' | 'no_permission' | 'expired' | 'failed';

export default function Dreamina() {
  const [status, setStatus] = useState<DreaminaStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [flow, setFlow] = useState<DreaminaLoginStart | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await dreaminaApi.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (deviceCode: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const r = await dreaminaApi.loginStatus(deviceCode);
          if (r.state === 'success') {
            stopPolling();
            setPhase('success');
            toast.success('即梦登录成功');
            setModalOpen(false);
            load();
          } else if (r.state === 'no_permission') {
            stopPolling();
            setPhase('no_permission');
            setMsg(r.message ?? null);
            load();
          } else if (r.state === 'expired' || r.state === 'failed') {
            stopPolling();
            setPhase(r.state);
            setMsg(r.message ?? null);
          }
          // pending: keep polling
        } catch {
          /* transient poll error — keep trying */
        }
      }, 2500);
    },
    [stopPolling, load],
  );

  const beginLogin = useCallback(async () => {
    setBusy(true);
    setModalOpen(true);
    setPhase('starting');
    setMsg(null);
    setFlow(null);
    try {
      const f = await dreaminaApi.login();
      setFlow(f);
      setPhase('waiting');
      window.open(f.verification_uri, '_blank', 'noopener,noreferrer');
      startPolling(f.device_code);
    } catch (e) {
      setPhase('failed');
      setMsg(e instanceof Error ? e.message : '发起登录失败');
    } finally {
      setBusy(false);
    }
  }, [startPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    setModalOpen(false);
  }, [stopPolling]);

  const logout = useCallback(async () => {
    if (!window.confirm('确认退出即梦登录？')) return;
    try {
      await dreaminaApi.logout();
      toast.success('已退出即梦登录');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '退出失败');
    }
  }, [load]);

  const isVip = !!status?.vip_level;
  const actions = (
    <>
      <button className="btn btn--secondary" onClick={load} disabled={loading}>
        刷新
      </button>
      {status?.logged_in ? (
        <button className="btn btn--ghost" onClick={logout}>
          退出登录
        </button>
      ) : null}
      <button className="btn btn--primary" onClick={beginLogin} disabled={busy}>
        {busy ? '处理中…' : status?.logged_in ? '重新登录' : '即梦登录'}
      </button>
    </>
  );

  return (
    <SettingsPage
      title="即梦登录"
      description="通过即梦官方 CLI 的 OAuth 设备登录接入即梦（AIGC 生成需高级及以上会员）。"
      actions={actions}
    >
      {loading && !status ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <>
          <div className="set-stats">
            <StatCard label="登录状态" value={<BoolBadge value={!!status?.logged_in} on="已登录" off="未登录" />} />
            <StatCard label="账号 ID" value={status?.user_id ?? '-'} />
            <StatCard
              label="会员等级"
              value={status?.vip_level ? <Badge tone="accent">{status.vip_level}</Badge> : <Badge tone="warning">非会员</Badge>}
            />
            <StatCard label="剩余积分" value={status?.total_credit ?? '-'} />
          </div>
          {status?.logged_in && !isVip ? (
            <ErrorNote message="当前即梦账号不是高级会员，可以登录但无法用于生成。请更换高级及以上会员账号。" />
          ) : null}
          {status && !status.logged_in && status.error ? <ErrorNote message={status.error} /> : null}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={cancel}
        title="即梦登录"
        width={440}
        footer={
          <button className="btn btn--ghost" onClick={cancel}>
            关闭
          </button>
        }
      >
        <div style={{ padding: '4px 0' }}>
          {phase === 'starting' && <Loading label="正在发起登录…" />}
          {phase === 'waiting' && flow ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p>已为你打开即梦授权页。请在<strong>已登录即梦的浏览器</strong>里点「授权」。</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => window.open(flow.verification_uri, '_blank', 'noopener,noreferrer')}
              >
                重新打开授权页
              </button>
              <p className="set-stat__sub">授权码：{flow.user_code}</p>
              <p className="set-stat__sub">授权完成后本窗口会自动更新；若弹出页未登录即梦，请先在其中登录。</p>
            </div>
          ) : null}
          {phase === 'success' && <Badge tone="success">登录成功</Badge>}
          {phase === 'no_permission' && <ErrorNote message={msg ?? '该账号无生成权限（需高级及以上会员）'} />}
          {(phase === 'expired' || phase === 'failed') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ErrorNote message={msg ?? '登录失败'} />
              <button type="button" className="btn btn--primary" onClick={beginLogin} disabled={busy}>
                重试
              </button>
            </div>
          )}
        </div>
      </Modal>
    </SettingsPage>
  );
}
