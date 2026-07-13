import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'canvas', name: 'canvases' })
export class Canvas {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  project_id: string;

  @Column({ type: 'varchar', length: 200, default: 'main' })
  name: string;

  @Column({ type: 'jsonb', default: () => "'{\"x\":0,\"y\":0,\"zoom\":1}'::jsonb" })
  viewport: { x: number; y: number; zoom: number };

  @Column({ type: 'uuid', nullable: true })
  last_modified_by: string | null;

  @Column({ type: 'int', default: 0 })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity({ schema: 'canvas', name: 'canvas_nodes' })
@Index(['canvas_id'])
export class CanvasNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  canvas_id: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'jsonb', default: () => "'{\"x\":0,\"y\":0}'::jsonb" })
  position: { x: number; y: number };

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  layout_zones: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

@Entity({ schema: 'canvas', name: 'canvas_edges' })
@Index(['canvas_id'])
export class CanvasEdge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  canvas_id: string;

  @Column({ type: 'uuid' })
  source_node_id: string;

  @Column({ type: 'varchar', length: 50 })
  source_handle: string;

  @Column({ type: 'uuid' })
  target_node_id: string;

  @Column({ type: 'varchar', length: 50 })
  target_handle: string;

  @Column({ type: 'varchar', length: 50 })
  data_type: string; // IOType or entity_ref:<kind>

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

@Entity({ schema: 'canvas', name: 'canvas_snapshots' })
export class CanvasSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  canvas_id: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'jsonb' })
  payload: { nodes: unknown[]; edges: unknown[]; viewport: unknown };

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
