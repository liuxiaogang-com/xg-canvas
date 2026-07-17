import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PROVIDER_AUTH_METHODS, type ProviderAuthMethod } from '@xgcanvas/shared-types';
import {
  HasNoSecretLikeConfigKeys,
  IsSafeOutboundBaseUrl,
} from '../catalog/outbound-config.validator';

export class CreateProviderDto {
  @IsString()
  @MaxLength(50)
  slug: string;

  @IsString()
  @MaxLength(200)
  display_name: string;

  @IsOptional()
  @IsString()
  icon_url?: string;

  @IsOptional()
  @IsString()
  homepage_url?: string;

  @IsOptional()
  @IsString()
  @IsSafeOutboundBaseUrl()
  base_url?: string;

  @IsOptional()
  @IsIn(PROVIDER_AUTH_METHODS)
  auth_method?: ProviderAuthMethod;

  @IsOptional()
  @IsObject()
  @HasNoSecretLikeConfigKeys('auth_config')
  auth_config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invocation_methods?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  adapter_keys: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sdk_package?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  documentation_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supported_regions?: string[];
}
