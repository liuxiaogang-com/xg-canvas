export const FAVORITE_TARGET_TYPES = ['asset', 'library_entry', 'entity'] as const;
export type FavoriteTargetType = (typeof FAVORITE_TARGET_TYPES)[number];
