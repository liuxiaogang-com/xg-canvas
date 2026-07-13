import { IsString, IsUUID, IsOptional } from 'class-validator';

export class PollRequestDto {
  @IsString()
  task_id!: string;

  @IsString()
  external_task_id!: string;

  @IsString()
  model_id!: string;

  @IsUUID()
  workspace_id!: string;

  @IsUUID()
  @IsOptional()
  project_id?: string;

  @IsUUID()
  channel_id!: string;

  @IsUUID()
  credential_id!: string;
}
