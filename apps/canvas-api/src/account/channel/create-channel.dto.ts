import { IsString, IsOptional, IsBoolean, IsInt, IsObject, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsObject()
  request_config?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  load_balance_strategy?: string;

  @IsOptional()
  @IsInt()
  weight?: number;

  @IsOptional()
  @IsInt()
  rate_limit_rpm?: number;

  @IsOptional()
  @IsInt()
  rate_limit_tpm?: number;

  @IsOptional()
  @IsInt()
  daily_quota?: number;

  @IsOptional()
  @IsInt()
  concurrent_limit?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  priority?: number;
}
