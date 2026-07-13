import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ASSET_TYPES, ASSET_VISIBILITIES, type AssetType, type AssetVisibility } from '@xgcanvas/shared-types';

export class CopyToProjectDto {
  @IsUUID()
  project_id: string;
}

export class BatchUrlsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids: string[];

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  ttl?: number;
}

export class UploadIntentDto {
  @IsIn(ASSET_TYPES)
  type: AssetType;

  @IsString()
  @MaxLength(100)
  mime_type: string;

  @IsInt()
  @Min(1)
  @Max(536870912)
  bytes: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsIn(ASSET_VISIBILITIES)
  visibility?: AssetVisibility;

  @IsOptional()
  @IsBoolean()
  with_thumbnail?: boolean;
}

export class CompleteUploadDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  duration_ms?: number;

  @IsOptional()
  @IsBoolean()
  has_thumbnail?: boolean;
}
