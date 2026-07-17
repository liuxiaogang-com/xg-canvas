import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  HasNoSecretLikeConfigKeys,
  IsSafeOutboundBaseUrl,
} from '../catalog/outbound-config.validator';

export class CreateChannelDto {
  @IsString()
  @MaxLength(100)
  slug: string;

  @IsString()
  @MaxLength(200)
  display_name: string;

  @IsString()
  @MaxLength(20)
  invocation_method: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  adapter_keys: string[];

  @IsOptional()
  @IsString()
  @IsSafeOutboundBaseUrl()
  base_url?: string;

  @IsOptional()
  @IsObject()
  @HasNoSecretLikeConfigKeys('request_config')
  request_config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
