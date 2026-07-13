/* 即梦登录面板 — 用于凭证向导中 cli_login 供应商。
 * 复用 Dreamina.tsx 的 device-flow 登录逻辑(window.open + 轮询)。
 * 显示登录状态 / 会员等级 / 积分,登录成功后回调 onLogin。 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Loading, ErrorNote } from '../../components/kit';
import { toast } from '../../../ui';
import { dreaminaApi } from '../../api';
import type { DreaminaStatusView, DreaminaLoginStart } from '../../types';

type Phase = 'idle' | 'starting' | 'waiting' | 'success' | 'no_permission' | 'expired' | 'failed';

export function DreaminaLoginPanel({ onLogin }: { onLogin: () => void }) {
  const [status, setStatus] = useState<DreaminaStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [flow, setFlow] = useState<DreaminaLoginStart | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await dreaminaApi.status());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
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
            load();
            onLogin();
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
        } catch { /* transient */ }
      }, 2500);
    },
    [stopPolling, load, onLogin],
  );

  const beginLogin = useCallback(async () => {
    setPhase('starting');
    setMsg(null);
    try {
      const f = await dreaminaApi.login();
      setFlow(f);
      setPhase('waiting');
      window.open(f.verification_uri, '_blank', 'noopener,noreferrer');
      startPolling(f.device_code);
    } catch (e) {
      setPhase('failed');
      setMsg(e instanceof Error ? e.message : '发起登录失败');
    }
  }, [startPolling]);

  if (loading) return <Loading label="检查即梦登录状态…" />;
  if (!status?.logged_in) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="set-stat__sub">该供应商需要通过即梦官方 OAuth 登录接入。</p>
        <button type="button" className="btn btn--primary btn--sm" onClick={beginLogin}>
          即梦登录
        </button>
        {phase === 'waiting' && flow ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p className="set-stat__sub">已打开授权页,请在已登录即梦的浏览器中点「授权」。</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(flow.verification_uri, '_blank', 'noopener,noreferrer')}>
              重新打开授权页
            </button>
          </div>
        ) : null}
        {(phase === 'expired' || phase === 'failed') && <ErrorNote message={msg ?? '登录失败'} />}
        {phase === 'no_permission' && <ErrorNote message={msg ?? '该账号无生成权限'} />}
      </div>
    );
  }
  // logged in
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Badge tone="success">已登录</Badge>
        <span className="set-stat__sub">ID: {status.user_id}</span>
        <Badge tone={status.vip_level ? 'accent' : 'warning'}>{status.vip_level || '非会员'}</Badge>
        <span className="set-stat__sub">积分: {status.total_credit ?? '-'}</span>
      </div>
      {!status.vip_level ? (
        <ErrorNote message="当前账号非高级会员,登录后无法用于生成。" />
      ) : null}
      <button type="button" className="btn btn--ghost btn--sm" onClick={beginLogin}>
        重新登录
      </button>
    </div>
  );
}
