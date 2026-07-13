import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** canvas.verification_challenges — SMS/email codes, magic-link tokens, and
 *  merge-confirm proofs. Only hashes are stored; rows are one-time + expiring. */
@Entity({ name: 'verification_challenges' })
export class VerificationChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  channel: string; // phone | email

  @Column({ type: 'varchar', length: 191 })
  target: string; // E.164 / normalized email

  @Column({ type: 'varchar', length: 20 })
  purpose: string; // login | bind | merge_confirm

  @Column({ type: 'text', nullable: true })
  code_hash: string | null;

  @Column({ type: 'text', nullable: true })
  token_hash: string | null;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempt_count: number;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
