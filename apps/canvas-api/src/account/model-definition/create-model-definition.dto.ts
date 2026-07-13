import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { ModelInputContract } from '@xgcanvas/shared-types';

import { IsModelInputContract } from './is-model-input-contract.decorator';

export class CreateModelDefinitionDto {
  @IsUUID()
  provider_id: string;

  @IsString()
  @MaxLength(200)
  model_id: string;

  @IsString()
  @MaxLength(200)
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
  @IsString()
  @MaxLength(20)
  invocation_mode?: string;

  @IsOptional()
  @IsBoolean()
  supports_streaming?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_channel_ids?: string[];

  @IsOptional()
  @IsObject()
  param_schema?: Record<string, any>;

  @IsOptional()
  @IsArray()
  param_constraints?: any[];

  @IsOptional()
  @IsObject()
  @IsModelInputContract()
  input_contract?: ModelInputContract;

  @IsOptional()
  @IsObject()
  limits?: Record<string, any>;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deprecated?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  adapter_key?: string;

  @IsOptional()
  @IsString()
  deprecated_message?: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}
