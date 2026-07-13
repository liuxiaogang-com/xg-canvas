import { IsArray, IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpsertFeatureConfigDto {
  @IsString()
  @Length(1, 100)
  feature_key: string;

  @IsString()
  @Length(1, 200)
  display_name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  model_ids: string[];

  @IsOptional()
  @IsString()
  primary_model_id?: string | null;

  @IsOptional()
  @IsString()
  fallback_model_id?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
