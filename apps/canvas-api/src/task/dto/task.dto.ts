import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  task_type: string; // gen.text | gen.image | ...

  @IsString()
  model_id: string;

  @IsObject()
  params: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  inputs?: Record<string, unknown>;

  @IsUUID()
  @IsOptional()
  project_id?: string;

  @IsUUID()
  @IsOptional()
  source_node_id?: string;
}
