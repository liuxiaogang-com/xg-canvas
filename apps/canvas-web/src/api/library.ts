import { api } from './client';
import type {
  CreateLibraryEntryInput,
  LibraryEntry,
  PublicLibraryProviderRef,
  UpdateLibraryEntryInput,
} from '@xgcanvas/shared-types';

export type LibraryProviderRefRecord = PublicLibraryProviderRef;
export type LibraryEntryRecord = LibraryEntry;

export const libraryApi = {
  list: (
    params: {
      kind?: string;
      project_id?: string | 'global';
      q?: string;
      favorited?: boolean;
      limit?: number;
      before?: string;
    } = {},
  ) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.append(k, String(v)));
    return api<LibraryEntryRecord[]>(`/library?${q.toString()}`);
  },
  detail: (id: string) => api<LibraryEntryRecord>(`/library/${id}`),
  create: (body: CreateLibraryEntryInput) =>
    api<LibraryEntryRecord>('/library', { method: 'POST', body }),
  update: (id: string, body: UpdateLibraryEntryInput) =>
    api<LibraryEntryRecord>(`/library/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/library/${id}`, { method: 'DELETE' }),
};
