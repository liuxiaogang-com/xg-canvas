import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** canvas.messages — one turn in a conversation. */
@Entity({ name: 'messages' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  conversation_id: string;

  @Column({ type: 'varchar', length: 20 })
  role: 'system' | 'user' | 'assistant' | 'tool';

  @Column({ type: 'text', default: '' })
  content: string;

  /** Reasoner chain-of-thought (DeepSeek reasoning_content), never resent to the model. */
  @Column({ type: 'text', nullable: true })
  reasoning: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tool_calls: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  usage: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  latency_ms: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  request_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
