import { api } from './client';
import type { FavoriteTargetType } from '@xgcanvas/shared-types';

export type { FavoriteTargetType } from '@xgcanvas/shared-types';

export const favoriteApi = {
  list: (targetType: FavoriteTargetType = 'asset') =>
    api<{ ids: string[] }>(`/favorites?target_type=${targetType}`),
  add: (targetType: FavoriteTargetType, targetId: string) =>
    api<void>('/favorites', { method: 'POST', body: { target_type: targetType, target_id: targetId } }),
  remove: (targetType: FavoriteTargetType, targetId: string) =>
    api<void>(`/favorites/${targetType}/${targetId}`, { method: 'DELETE' }),
};
