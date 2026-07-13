import { IsString, IsUUID } from 'class-validator';

export class CancelRequestDto {
  @IsString()
  external_task_id!: string;

  @IsString()
  model_id!: string;

  @IsUUID()
  channel_id!: string;

  @IsUUID()
  credential_id!: string;
}
