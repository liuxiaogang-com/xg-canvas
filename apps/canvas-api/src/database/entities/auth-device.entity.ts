import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** canvas.auth_devices — one row per device; the unit the device-count limit
 *  and remote "踢设备" act on. */
@Entity({ name: 'auth_devices' })
export class AuthDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  client_device_id: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  device_label: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  platform: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ type: 'inet', nullable: true })
  last_ip: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  first_seen_at: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  last_seen_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;
}
