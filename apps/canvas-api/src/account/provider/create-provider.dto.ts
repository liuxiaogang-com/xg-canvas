import { IsString, IsOptional, IsBoolean, IsInt, IsArray, MaxLength } from 'class-validator';

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
  base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  auth_method?: string;

  @IsOptional()
  auth_config?: Record<string, any>;

  @IsOptional()
  invocation_methods?: string[];

  @IsOptional()
  adapter_keys?: string[];

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
