import { useEffect, useState, type ReactNode } from 'react';

import { Drawer, toast } from '../../ui';
import { requestLogApi } from '../api';
import { Badge, Column, DataTable, ErrorNote, Loading, SettingsPage } from '../components/kit';
import type { RequestLogRow } from '../types';
import './logs.css';

interface AiResult {
  analysis: string;
  model_id: string | null;
}

interface ChatTurn {
  role?: string;
  content?: string;
}

/** Render request context: a messages list, or a prompt object. */
function RequestContext({ body }: { body: unknown }): ReactNode {
  if (Array.isArray(body)) {
    return (
      <div className="log-detail__msgs">
        {(body as ChatTurn[]).map((m, i) => (
          <div key={i} className="log-detail__turn">
            <span className="log-detail__role">{m.role ?? '?'}</span>
            <span className="log-detail__turn-text">{m.content ?? ''}</span>
          </div>
        ))}
      </div>
    );
  }
  const o = (body ?? {}) as { prompt?: string; system_prompt?: string };
  return (
    <div className="log-detail__msgs">
      {o.system_prompt ? (
        <div className="log-detail__turn">
          <span className="log-detail__role">system</span>
          <span className="log-detail__turn-text">{o.system_prompt}</span>
        </div>
      ) : null}
      <div className="log-detail__turn">
        <span className="log-detail__role">prompt</span>
        <span className="log-detail__turn-text">{o.prompt ?? '—'}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="log-detail__sec">
      <div className="log-detail__sec-title">{title}</div>
      {children}
    </div>
  );
}

function respText(body: unknown): string {
  if (body && typeof body === 'object' && 'text' in body) {
    return String((body as { text?: unknown }).text ?? '');
  }
  return body ? JSON.stringify(body, null, 2) : '—';
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  success: 'success',
  error: 'danger',
  timeout: 'warning',
  pending: 'info',
  cancelled: 'default',
};

/** 请求日志 — every vendor API request, filterable, with a row-detail panel. (F4) */
export default function Logs() {
  const [rows, setRows] = useState<RequestLogRow[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<RequestLogRow | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<AiResult | null>(null);

  // Reset the per-log analysis whenever a different log detail is opened.
  const openDetail = (row: RequestLogRow) => {
    setSel(row);
    setAi(null);
  };

  const runAnalyze = async () => {
    if (!sel) return;
    setAiLoading(true);
    setAi(null);
    try {
      const r = await requestLogApi.analyze(sel.id);
      setAi(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const load = () =>
      requestLogApi
        .list({ status: status || undefined, limit: 100 })
        .then((r) => {
          setRows(r);
          setErr('');
        })
        .catch((e) => setErr((e as Error).message))
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [status]);

  const columns: Column<RequestLogRow>[] = [
    { key: 'created_at', header: '时间', width: 160, render: (r) => new Date(r.created_at).toLocaleString('zh-CN') },
    {
      key: 'status',
      header: '状态',
      width: 76,
      render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'default'}>{r.status}</Badge>,
    },
    { key: 'source', header: '来源', width: 70 },
    { key: 'model_id', header: '模型', render: (r) => r.model_id ?? '—' },
    { key: 'credential_label', header: '凭证', width: 110, render: (r) => r.credential_label ?? '—' },
    { key: 'latency_ms', header: '延迟', width: 80, render: (r) => (r.latency_ms != null ? `${r.latency_ms}ms` : '—') },
    { key: 'id', header: '请求 ID', width: 96, render: (r) => <code>{r.id.slice(0, 8)}</code> },
  ];

  return (
    <SettingsPage
      title="请求日志"
      description="所有厂商 API 请求的可观测日志(每 5 秒刷新)。点击一行查看参数、用量与厂商原始错误。"
      actions={
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 130 }}>
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="error">失败</option>
        </select>
      }
    >
      {loading ? (
        <Loading />
      ) : err ? (
        <ErrorNote message={err} />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={openDetail} empty="暂无请求日志" />
          <Drawer open={!!sel} onClose={() => setSel(null)} title="请求详情" side="right" width={580}>
            {sel ? (
              <div className="log-detail">
                <div className="log-detail__head">
                  <Badge tone={STATUS_TONE[sel.status] ?? 'default'}>{sel.status}</Badge>
                  <code className="log-detail__id">{sel.id}</code>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={runAnalyze}
                    disabled={aiLoading}
                  >
                    {aiLoading ? '分析中…' : 'AI 分析'}
                  </button>
                </div>

                <Section title="概要">
                  <div className="log-detail__kv">
                    <span>逻辑请求</span>
                    <code>{sel.logical_request_id ?? '—'}</code>
                    <span>尝试序号</span>
                    <span>{sel.attempt_no ?? '—'}</span>
                    <span>模型</span>
                    <span>{sel.model_id ?? '—'}</span>
                    <span>模型资源</span>
                    <code>{sel.model_resource_uid ?? '—'}</code>
                    <span>模型修订</span>
                    <code>{sel.model_revision_id ?? '—'}</code>
                    <span>费率修订</span>
                    <code>{sel.rate_card_revision_id ?? '—'}</code>
                    <span>目录 Epoch</span>
                    <span>{sel.catalog_epoch ?? '—'}</span>
                    <span>供应商</span>
                    <span>{sel.provider_slug ?? '—'}</span>
                    <span>渠道资源</span>
                    <code>{sel.channel_resource_uid ?? '—'}</code>
                    <span>凭证</span>
                    <span>{sel.credential_label ?? '—'}</span>
                    <span>延迟</span>
                    <span>{sel.latency_ms != null ? `${sel.latency_ms}ms` : '—'}</span>
                    <span>HTTP</span>
                    <span>{sel.http_status ?? '—'}</span>
                    <span>用量</span>
                    <span>{sel.usage ? JSON.stringify(sel.usage) : '—'}</span>
                  </div>
                </Section>

                <Section title="请求上下文(发给模型)">
                  <RequestContext body={sel.request_body} />
                </Section>

                <Section title="返回内容">
                  <div className="log-detail__resp">{respText(sel.response_body)}</div>
                </Section>

                {sel.error_message ? (
                  <Section title="错误">
                    <div className="log-detail__err">
                      {sel.error_code}: {sel.error_message}
                    </div>
                    {sel.vendor_error ? (
                      <pre className="log-detail__raw">{JSON.stringify(sel.vendor_error, null, 2)}</pre>
                    ) : null}
                  </Section>
                ) : null}

                {aiLoading || ai ? (
                  <Section title="AI 分析">
                    {aiLoading ? (
                      <Loading label="模型分析中…" />
                    ) : (
                      <div className="log-ai">
                        {ai?.model_id ? <div className="log-ai__meta">模型 {ai.model_id}</div> : null}
                        <div className="log-ai__body">{ai?.analysis}</div>
                      </div>
                    )}
                  </Section>
                ) : null}
              </div>
            ) : null}
          </Drawer>
        </>
      )}
    </SettingsPage>
  );
}
