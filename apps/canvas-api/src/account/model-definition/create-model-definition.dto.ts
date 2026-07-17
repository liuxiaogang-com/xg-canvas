import { CATALOG_VISIBILITIES, MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';
import type { ModelInputContract } from '@xgcanvas/shared-types';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsModelInputContract } from './is-model-input-contract.decorator';

export class CreateModelDefinitionDto {
  @IsUUID()
  provider_resource_uid: string;

  @IsString()
  @MaxLength(MAX_MODEL_ID_LENGTH)
  model_id: string;

  @IsString()
  @MaxLength(MAX_MODEL_ID_LENGTH)
  provider_model_id: string;

  @IsString()
  @MaxLength(200)
  display_name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsArray()
  @IsString({ each: true })
  task_types: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsIn(['sync', 'async', 'stream'])
  invocation_mode?: 'sync' | 'async' | 'stream';

  @IsOptional()
  @IsBoolean()
  supports_streaming?: boolean;

  @IsString()
  @MaxLength(50)
  adapter_key: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  allowed_channel_resource_uids: string[];

  @IsOptional()
  @IsObject()
  param_schema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  param_constraints?: unknown[];

  @IsOptional()
  @IsObject()
  @IsModelInputContract()
  input_contract?: ModelInputContract;

  @IsOptional()
  @IsObject()
  poll_policy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(CATALOG_VISIBILITIES)
  visibility?: 'public' | 'internal' | 'hidden';

  @IsOptional()
  @IsString()
  deprecated_message?: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}
