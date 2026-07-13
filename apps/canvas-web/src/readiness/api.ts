import { api } from '../api/client';
import type { ReadinessItemId, ReadinessStatus } from './catalog';

export interface ReadinessItemResult {
  id: ReadinessItemId;
  status: ReadinessStatus;
}

export interface ReadinessSurfaceResult {
  ready: boolean;
  missing: ReadinessItemId[];
}

export interface InstanceReadinessSnapshot {
  items: ReadinessItemResult[];
  surfaces: Record<string, ReadinessSurfaceResult>;
}

export const readinessApi = {
  get: () => api<InstanceReadinessSnapshot>('/instance/readiness'),
};
