import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestLog } from '../request-log/request-log.entity';

/** One billed dimension (model / member / project), split by currency. */
export interface BillingRow {
  key: string | null;
  label: string | null;
  currency: string | null;
  requests: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
}

export interface BillingOverview {
  requests: number;
  success: number;
  error: number;
  input_tokens: number;
  output_tokens: number;
  /** Cost summed per currency (meters are native — never converted across currencies). */
  by_currency: { currency: string; cost: number }[];
}

/**
 * Billing analytics over ops.request_logs — the per-request ledger. Cost was frozen at
 * write time, so these aggregates reflect what each request actually cost under the rate
 * card in force then. Sums are kept per-currency (no cross-currency conversion).
 */
@Injectable()
export class BillingService {
  constructor(@InjectRepository(RequestLog) private readonly repo: Repository<RequestLog>) {}

  async overview(): Promise<BillingOverview> {
    const [totals] = (await this.repo.query(
      `SELECT COUNT(*)::int AS requests,
              COUNT(*) FILTER (WHERE status='success')::int AS success,
              COUNT(*) FILTER (WHERE status='error')::int AS error,
              COALESCE(SUM((usage->>'input_tokens')::numeric),0)::float8 AS input_tokens,
              COALESCE(SUM((usage->>'output_tokens')::numeric),0)::float8 AS output_tokens
         FROM ops.request_logs`,
    )) as Array<Record<string, number>>;

    const byCur = (await this.repo.query(
      `SELECT cost_currency AS currency, COALESCE(SUM(cost),0)::float8 AS cost
         FROM ops.request_logs
        WHERE cost IS NOT NULL
        GROUP BY cost_currency
        ORDER BY cost DESC`,
    )) as Array<{ currency: string; cost: number }>;

    return {
      requests: Number(totals?.requests ?? 0),
      success: Number(totals?.success ?? 0),
      error: Number(totals?.error ?? 0),
      input_tokens: Number(totals?.input_tokens ?? 0),
      output_tokens: Number(totals?.output_tokens ?? 0),
      by_currency: byCur.map((r) => ({ currency: r.currency ?? '—', cost: Number(r.cost) })),
    };
  }

  byModel(): Promise<BillingRow[]> {
    return this.aggregate('r.model_id', null);
  }

  byMember(): Promise<BillingRow[]> {
    return this.aggregate('r.owner_id', {
      table: 'canvas.users u',
      on: 'u.id = r.owner_id',
      label: 'u.display_name',
    });
  }

  byProject(): Promise<BillingRow[]> {
    return this.aggregate('r.project_id', {
      table: 'canvas.projects p',
      on: 'p.id = r.project_id',
      label: 'p.name',
    });
  }

  /** Shared GROUP BY (dimension, currency) with an optional label join. */
  private async aggregate(
    keyExpr: string,
    join: { table: string; on: string; label: string } | null,
  ): Promise<BillingRow[]> {
    const labelExpr = join ? join.label : keyExpr;
    const joinClause = join ? `LEFT JOIN ${join.table} ON ${join.on}` : '';
    const rows = (await this.repo.query(
      `SELECT ${keyExpr} AS key,
              ${labelExpr} AS label,
              r.cost_currency AS currency,
              COUNT(*)::int AS requests,
              COALESCE(SUM(r.cost),0)::float8 AS cost,
              COALESCE(SUM((r.usage->>'input_tokens')::numeric),0)::float8 AS input_tokens,
              COALESCE(SUM((r.usage->>'output_tokens')::numeric),0)::float8 AS output_tokens
         FROM ops.request_logs r
         ${joinClause}
        WHERE r.status='success'
        GROUP BY ${keyExpr}, ${labelExpr === keyExpr ? '' : labelExpr + ','} r.cost_currency
        ORDER BY cost DESC NULLS LAST`,
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      key: (r.key as string) ?? null,
      label: (r.label as string) ?? null,
      currency: (r.currency as string) ?? null,
      requests: Number(r.requests),
      cost: Number(r.cost),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
    }));
  }
}
