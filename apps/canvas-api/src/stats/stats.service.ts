import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Task } from '../database/entities';

export interface OverviewResult {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  queued: number;
  estimated_cost: number;
}

export interface ProjectStats {
  project_id: string | null;
  project_name: string | null;
  total: number;
  succeeded: number;
  failed: number;
  estimated_cost: number;
}

export interface ModelStats {
  model_id: string;
  total: number;
  succeeded: number;
  success_rate: number;
  last_used_at: Date | null;
}

export interface MemberStats {
  owner_id: string;
  display_name: string | null;
  email: string | null;
  total: number;
  succeeded: number;
  failed: number;
  estimated_cost: number;
}

const MOCK_COST_PER_TASK = 0.5;

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
  ) {}

  async overview(workspaceId?: string): Promise<OverviewResult> {
    const where = workspaceId ? 'WHERE workspace_id = $1' : '';
    const params = workspaceId ? [workspaceId] : [];

    const rows: Array<{ status: string; count: string }> = await this.tasks.query(
      `SELECT status, COUNT(*)::int AS count FROM canvas.tasks ${where} GROUP BY status`,
      params,
    );

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const n = Number(row.count);
      counts[row.status] = n;
      total += n;
    }

    const succeeded = counts['succeeded'] ?? 0;
    return {
      total,
      succeeded,
      failed: counts['failed'] ?? 0,
      cancelled: counts['cancelled'] ?? 0,
      running: counts['running'] ?? 0,
      queued: counts['queued'] ?? 0,
      estimated_cost: succeeded * MOCK_COST_PER_TASK,
    };
  }

  async byProject(workspaceId?: string): Promise<ProjectStats[]> {
    const where = workspaceId ? 'WHERE t.workspace_id = $1' : '';
    const params = workspaceId ? [workspaceId] : [];

    const rows: Array<Record<string, unknown>> = await this.tasks.query(
      `SELECT t.project_id,
              p.name AS project_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.status = 'succeeded')::int AS succeeded,
              COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed
         FROM canvas.tasks t
         LEFT JOIN canvas.projects p ON p.id = t.project_id
         ${where}
         GROUP BY t.project_id, p.name
         ORDER BY total DESC`,
      params,
    );

    return rows.map((r) => ({
      project_id: r.project_id as string | null,
      project_name: r.project_name as string | null,
      total: Number(r.total),
      succeeded: Number(r.succeeded),
      failed: Number(r.failed),
      estimated_cost: Number(r.succeeded) * MOCK_COST_PER_TASK,
    }));
  }

  async byModel(workspaceId?: string): Promise<ModelStats[]> {
    const where = workspaceId ? 'WHERE workspace_id = $1' : '';
    const params = workspaceId ? [workspaceId] : [];

    const rows: Array<Record<string, unknown>> = await this.tasks.query(
      `SELECT model_id,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
              MAX(created_at) AS last_used_at
         FROM canvas.tasks
         ${where}
         GROUP BY model_id
         ORDER BY total DESC`,
      params,
    );

    return rows.map((r) => {
      const total = Number(r.total);
      const succeeded = Number(r.succeeded);
      return {
        model_id: r.model_id as string,
        total,
        succeeded,
        success_rate: total > 0 ? Math.round((succeeded / total) * 10000) / 100 : 0,
        last_used_at: r.last_used_at ? new Date(r.last_used_at as string) : null,
      };
    });
  }

  async byMember(workspaceId?: string): Promise<MemberStats[]> {
    const where = workspaceId ? 'WHERE t.workspace_id = $1' : '';
    const params = workspaceId ? [workspaceId] : [];

    const rows: Array<Record<string, unknown>> = await this.tasks.query(
      `SELECT t.owner_id,
              u.display_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE t.status = 'succeeded')::int AS succeeded,
              COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed
         FROM canvas.tasks t
         LEFT JOIN canvas.users u ON u.id = t.owner_id
         ${where}
         GROUP BY t.owner_id, u.display_name
         ORDER BY total DESC`,
      params,
    );

    return rows.map((r) => ({
      owner_id: r.owner_id as string,
      display_name: r.display_name as string | null,
      email: null,
      total: Number(r.total),
      succeeded: Number(r.succeeded),
      failed: Number(r.failed),
      estimated_cost: Number(r.succeeded) * MOCK_COST_PER_TASK,
    }));
  }
}
