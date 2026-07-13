import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CostService } from '../billing/cost.service';
import { RequestLog } from './request-log.entity';

export type RequestLogStatus = 'success' | 'error' | 'timeout' | 'cancelled';

/** A completed request to persist. Caller pre-generates `id` (the request id) at
 *  request start so it can be surfaced on error before this write happens.
 *  IMPORTANT: request_summary must already be sanitized — never pass secrets. */
export interface RecordRequestLog {
  id: string;
  source: string;
  operation?: string | null;
  owner_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  conversation_id?: string | null;
  provider_slug?: string | null;
  model_id?: string | null;
  adapter_key?: string | null;
  channel_id?: string | null;
  credential_id?: string | null;
  credential_label?: string | null;
  status: RequestLogStatus;
  http_status?: number | null;
  latency_ms?: number | null;
  request_summary?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  vendor_error?: unknown;
  /** Sanitized request context (messages / prompt) — what was sent to the model. */
  request_body?: unknown;
  /** Response content (text) — what came back. */
  response_body?: unknown;
}

export interface RequestLogQuery {
  status?: string;
  source?: string;
  provider_slug?: string;
  model_id?: string;
  owner_id?: string;
  /** created_at cursor (ISO) for keyset pagination. */
  before?: string;
  limit?: number;
}

export interface PurgeOptions {
  before?: Date;
  status?: string;
  provider_slug?: string;
}

@Injectable()
export class RequestLogService {
  constructor(
    @InjectRepository(RequestLog)
    private readonly repo: Repository<RequestLog>,
    private readonly cost: CostService,
  ) {}

  /** Persist one completed request. Best-effort: callers should not let a log
   *  write failure break the actual request (wrap in catch at the call site).
   *  Freezes the request's cost from its native usage meters × the model's current rate. */
  async record(e: RecordRequestLog): Promise<void> {
    let cost: number | null = null;
    let cost_currency: string | null = null;
    if (e.status === 'success' && e.usage) {
      const c = await this.cost.computeCost(e.model_id, e.usage).catch(() => null);
      if (c) {
        cost = c.cost;
        cost_currency = c.currency;
      }
    }
    // `as never`: TypeORM's QueryDeepPartialEntity mistypes jsonb object columns.
    await this.repo.insert({ ...e, cost, cost_currency, finished_at: new Date() } as never);
  }

  async list(q: RequestLogQuery): Promise<RequestLog[]> {
    const qb = this.repo.createQueryBuilder('r').orderBy('r.created_at', 'DESC');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.source) qb.andWhere('r.source = :source', { source: q.source });
    if (q.provider_slug) qb.andWhere('r.provider_slug = :p', { p: q.provider_slug });
    if (q.model_id) qb.andWhere('r.model_id = :m', { m: q.model_id });
    if (q.owner_id) qb.andWhere('r.owner_id = :o', { o: q.owner_id });
    if (q.before) qb.andWhere('r.created_at < :before', { before: q.before });
    qb.limit(Math.min(q.limit ?? 50, 200));
    return qb.getMany();
  }

  get(id: string): Promise<RequestLog | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Retention cleanup. Refuses to run without at least one filter (no mass wipe). */
  async purge(opts: PurgeOptions): Promise<number> {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.before) {
      where.push('created_at < :before');
      params.before = opts.before;
    }
    if (opts.status) {
      where.push('status = :status');
      params.status = opts.status;
    }
    if (opts.provider_slug) {
      where.push('provider_slug = :p');
      params.p = opts.provider_slug;
    }
    if (where.length === 0) return 0;
    const res = await this.repo.createQueryBuilder().delete().where(where.join(' AND '), params).execute();
    return res.affected ?? 0;
  }
}
