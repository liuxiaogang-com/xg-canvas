import { MAX_MODEL_ID_LENGTH, TASK_TYPES, type TaskType } from '@xgcanvas/shared-types';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsIn(TASK_TYPES)
  task_type: TaskType;

  @IsString()
  @MaxLength(MAX_MODEL_ID_LENGTH)
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
