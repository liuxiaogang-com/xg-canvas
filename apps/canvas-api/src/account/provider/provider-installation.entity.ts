import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'account', name: 'provider_installations' })
export class ProviderInstallation {
  @PrimaryColumn('uuid')
  provider_resource_uid: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'jsonb', default: {} })
  config_overrides: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
