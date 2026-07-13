import { IsArray, IsBoolean, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class InvokeRequestDto {
  /** Internal task id minted by canvas-api. Used for storage_key path. */
  @IsString()
  task_id!: string;

  @IsString()
  task_type!: string;

  @IsString()
  model_id!: string;

  @IsUUID()
  workspace_id!: string;

  /** Requesting user — captured on the request log for per-user billing/usage. */
  @IsUUID()
  @IsOptional()
  owner_id?: string;

  @IsUUID()
  @IsOptional()
  project_id?: string;

  @IsObject()
  params!: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  inputs?: Record<string, unknown>;

  /** Pin a specific channel/credential pair (admin testing). */
  @IsUUID()
  @IsOptional()
  channel_id?: string;

  @IsUUID()
  @IsOptional()
  credential_id?: string;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @IsString()
  @IsOptional()
  idempotency_key?: string;
}
