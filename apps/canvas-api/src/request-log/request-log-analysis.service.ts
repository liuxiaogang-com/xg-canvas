import { Injectable, NotFoundException } from '@nestjs/common';

import { AccountInvokeClient, AccountModelsClient } from '../account-client';
import { RequestLogService } from './request-log.service';
import type { RequestLog } from './request-log.entity';
import { presentRequestLog } from './request-log.presenter';

const SYSTEM_PROMPT = [
  '你是 XG Canvas 平台的运维助手。下面是一条对外厂商 API 请求的完整记录(已脱敏,不含密钥)。',
  '请用简体中文简明分析这一次请求:',
  '1) 发生了什么:成功还是失败,关键结果是什么;',
  '2) 若失败,最可能的原因(结合错误码/厂商原始错误/参数);若成功,延迟与用量是否合理;',
  '3) 可执行建议:具体到改配置/换渠道/查凭证/调参数等可操作步骤。',
  '简洁直接,避免空话套话。',
].join('\n');

export interface AnalyzeResult {
  analysis: string;
  model_id: string | null;
  request_id?: string;
}

/**
 * AI log analysis — for ONE request log: summarizes its dimensions, params, context,
 * result and error (never secrets) and asks a text model to diagnose. Reuses the same
 * invoke path as chat, so the analysis call is itself billed + logged.
 */
@Injectable()
export class RequestLogAnalysisService {
  constructor(
    private readonly logs: RequestLogService,
    private readonly invoke: AccountInvokeClient,
    private readonly models: AccountModelsClient,
  ) {}

  async analyzeOne(id: string, ownerId: string, workspaceId: string): Promise<AnalyzeResult> {
    const stored = await this.logs.get(id);
    if (!stored) throw new NotFoundException('日志不存在');
    const log = presentRequestLog(stored);

    const modelId = await this.models.requireFeatureModel('ai-analysis', 'gen.text');

    const summary = buildSingleSummary(log);
    const res = await this.invoke.invoke({
      task_id: `loganalyze-${id}`,
      task_type: 'gen.text',
      model_id: modelId,
      workspace_id: workspaceId,
      owner_id: ownerId,
      params: { prompt: summary, temperature: 0.3, max_tokens: 900 },
      inputs: {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: summary },
        ],
      },
      resolution: { kind: 'current' },
    });
    return {
      analysis: res.text ?? '(模型未返回内容)',
      model_id: modelId,
      request_id: (res as { request_id?: string }).request_id,
    };
  }
}

/** Secret-free digest of one request log for the model. Bodies are truncated. */
function buildSingleSummary(r: RequestLog): string {
  const clip = (v: unknown, n = 600): string => {
    if (v == null) return '—';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > n ? `${s.slice(0, n)}…(已截断)` : s;
  };
  const lines = [
    `请求 ID: ${r.id}`,
    `时间: ${r.created_at?.toISOString?.() ?? '?'}`,
    `状态: ${r.status}${r.http_status != null ? ` (HTTP ${r.http_status})` : ''}`,
    `模型: ${r.model_id ?? '—'} / 供应商: ${r.provider_slug ?? '—'} / 适配器: ${r.adapter_key ?? '—'}`,
    `凭证: ${r.credential_label ?? '—'} / 渠道: ${r.channel_resource_uid ?? '—'}`,
    `延迟: ${r.latency_ms != null ? `${r.latency_ms}ms` : '—'}`,
    `用量: ${r.usage ? clip(r.usage, 300) : '—'}`,
    `请求参数: ${clip(r.request_summary, 400)}`,
    `请求上下文: ${clip(r.request_body)}`,
  ];
  if (r.status === 'success') {
    lines.push(`返回内容: ${clip(r.response_body)}`);
  } else {
    lines.push(`错误码: ${r.error_code ?? '—'}`);
    lines.push(`错误信息: ${r.error_message ?? '—'}`);
    if (r.vendor_error) lines.push(`厂商原始错误: ${clip(r.vendor_error, 500)}`);
  }
  return lines.join('\n');
}
