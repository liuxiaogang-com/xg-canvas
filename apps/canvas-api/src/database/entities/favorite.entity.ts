import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { FavoriteTargetType } from '@xgcanvas/shared-types';

/** Per-user favorite over any resource kind; existence of the row = favorited. */
@Entity({ schema: 'canvas', name: 'favorites' })
@Index(['target_type', 'target_id'])
export class Favorite {
  @PrimaryColumn({ type: 'uuid' })
  user_id: string;

  @PrimaryColumn({ type: 'varchar', length: 30 })
  target_type: FavoriteTargetType;

  @PrimaryColumn({ type: 'uuid' })
  target_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
