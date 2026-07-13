import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'account', name: 'system_settings' })
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  public_config: Record<string, unknown>;

  @Column({ type: 'bytea', nullable: true })
  encrypted_payload: Buffer | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  encryption_key_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
