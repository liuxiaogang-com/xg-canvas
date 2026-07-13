import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { authApi, type AuthConfig } from '../../api/auth';
import { ApiError } from '../../api/client';
import { OAuthButtons } from '../../auth/OAuthButtons';
import {
  SettingsPage,
  DataTable,
  Badge,
  Loading,
  ErrorNote,
  type Column,
} from '../../settings/components/kit';
import { toast } from '../../ui';
import { accountApi } from '../api';
import type { IdentityView } from '../types';

const PROVIDER: Record<string, string> = {
  email: '邮箱',
  phone: '手机号',
  password: '密码',
  wechat_oa: '微信',
  wechat_open: '微信',
  feishu: '飞书',
  mock: 'Mock',
};

export default function LoginMethods() {
  const [rows, setRows] = useState<IdentityView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [oauthConflict, setOauthConflict] = useState(false);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    setErr(null);
    try {
      setRows(await accountApi.identities());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    load();
    authApi.config().then(setCfg).catch(() => undefined);
  }, [load]);

  // The OAuth bind redirect lands here with ?bind=ok|conflict|error.
  useEffect(() => {
    const b = params.get('bind');
    if (!b) return;
    if (b === 'ok') toast.success('绑定成功');
    else if (b === 'conflict') setOauthConflict(true); // proven identity stashed server-side
    else toast.error('绑定失败');
    params.delete('bind');
    setParams(params, { replace: true });
    load();
  }, [params, setParams, load]);

  const resolveOauth = async (mode: 'force' | 'merge') => {
    try {
      if (mode === 'force') await accountApi.oauthForceBind();
      else await accountApi.oauthMerge();
      toast.success(mode === 'force' ? '已强制绑定' : '已合并账号');
      setOauthConflict(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const unbind = async (id: string) => {
    try {
      await accountApi.unbindIdentity(id);
      toast.success('已解绑');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '解绑失败');
    }
  };

  const columns: Column<IdentityView>[] = [
    {
      key: 'provider',
      header: '方式',
      render: (r) => (
        <span>
          {PROVIDER[r.provider] ?? r.provider}
          {r.is_primary ? (
            <>
              {' '}
              <Badge tone="accent">主</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    { key: 'label', header: '标识', render: (r) => r.label },
    {
      key: 'verified',
      header: '状态',
      render: (r) => <Badge tone={r.verified ? 'success' : 'default'}>{r.verified ? '已验证' : '未验证'}</Badge>,
    },
    {
      key: 'act',
      header: '操作',
      width: 90,
      render: (r) => (
        <button type="button" className="btn btn--danger" onClick={() => unbind(r.id)}>
          解绑
        </button>
      ),
    },
  ];

  if (err)
    return (
      <SettingsPage title="登录方式">
        <ErrorNote message={err} />
      </SettingsPage>
    );
  if (!rows)
    return (
      <SettingsPage title="登录方式">
        <Loading />
      </SettingsPage>
    );

  return (
    <SettingsPage title="登录方式" description="管理你账户的登录方式；系统始终为你保留至少一种。">
      {oauthConflict ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: '1px solid var(--color-border-2, #444)',
            borderRadius: 8,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13 }}>刚才那个第三方登录已绑定到其他账户。你可以：</span>
          <button type="button" className="btn btn--primary" onClick={() => resolveOauth('force')}>
            强制绑定到我
          </button>
          <button type="button" className="btn btn--danger" onClick={() => resolveOauth('merge')}>
            合并对方账号
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setOauthConflict(false)}>
            取消
          </button>
        </div>
      ) : null}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="暂无登录方式" />
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>添加登录方式</h3>
      {cfg?.methods.includes('email_code') ? <BindContact channel="email" onDone={load} /> : null}
      {cfg?.methods.includes('phone_code') ? <BindContact channel="phone" onDone={load} /> : null}
      {cfg?.oauth?.length ? <OAuthButtons keys={cfg.oauth} mode="bind" /> : null}
    </SettingsPage>
  );
}

function BindContact({ channel, onDone }: { channel: 'email' | 'phone'; onDone: () => void }) {
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [cd, setCd] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [mCode, setMCode] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(timer.current), []);

  const countdown = () => {
    setCd(60);
    timer.current = setInterval(() => setCd((c) => (c <= 1 ? (clearInterval(timer.current), 0) : c - 1)), 1000);
  };

  const send = async () => {
    if (!target) return;
    try {
      const r =
        channel === 'email'
          ? await accountApi.sendBindEmailCode(target)
          : await accountApi.sendBindPhoneCode(target);
      countdown();
      if (r.devCode) {
        setCode(r.devCode);
        toast.info(`开发环境验证码：${r.devCode}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
    }
  };

  const reset = () => {
    setTarget('');
    setCode('');
    setConflict(false);
    setMCode('');
    onDone();
  };

  const bind = async () => {
    try {
      if (channel === 'email') await accountApi.bindEmail(target, code);
      else await accountApi.bindPhone(target, code);
      toast.success('绑定成功');
      reset();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'IDENTITY_ALREADY_BOUND') {
        setConflict(true);
        toast.error('该方式已绑定到其他账户，可强制绑定或合并');
      } else {
        toast.error(e instanceof Error ? e.message : '绑定失败');
      }
    }
  };

  const sendMerge = async () => {
    try {
      const r = await accountApi.sendMergeCode(channel, target);
      countdown();
      if (r.devCode) {
        setMCode(r.devCode);
        toast.info(`确认码：${r.devCode}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发送失败');
    }
  };

  const resolve = async (mode: 'force' | 'merge') => {
    try {
      if (mode === 'force') await accountApi.forceBind(channel, target, mCode);
      else await accountApi.mergeAccount(channel, target, mCode);
      toast.success(mode === 'force' ? '已强制绑定' : '已合并账号');
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="input"
          placeholder={channel === 'email' ? '邮箱' : '手机号'}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={{ flex: 1 }}
        />
        <input className="input" placeholder="验证码" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 110 }} />
        <button type="button" className="btn btn--secondary" disabled={cd > 0} onClick={send} style={{ whiteSpace: 'nowrap' }}>
          {cd > 0 ? `${cd}s` : '发码'}
        </button>
        <button type="button" className="btn btn--primary" onClick={bind}>
          绑定
        </button>
      </div>
      {conflict ? (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            border: '1px solid var(--color-border-2, #444)',
            borderRadius: 8,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13 }}>该方式已绑定到其他账户。验证你对它的所有权后可：</span>
          <input className="input" placeholder="确认码" value={mCode} onChange={(e) => setMCode(e.target.value)} style={{ width: 110 }} />
          <button type="button" className="btn btn--secondary" disabled={cd > 0} onClick={sendMerge}>
            {cd > 0 ? `${cd}s` : '发确认码'}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => resolve('force')}>
            强制绑定到我
          </button>
          <button type="button" className="btn btn--danger" onClick={() => resolve('merge')}>
            合并对方账号
          </button>
        </div>
      ) : null}
    </div>
  );
}
