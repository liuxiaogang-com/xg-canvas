import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ASSET_VISIBILITIES, type AssetVisibility } from '@xgcanvas/shared-types';

export class LibraryMaterialDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  asset_ids: string[];
}

export class CreateLibraryEntryDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  kind: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsIn(ASSET_VISIBILITIES)
  visibility?: AssetVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  cover_asset_id?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LibraryMaterialDto)
  material?: LibraryMaterialDto | null;

  @IsOptional()
  @IsEmpty({ message: 'provider_refs are managed by the verified provider-binding workflow' })
  provider_refs?: never;
}

export class UpdateLibraryEntryDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsIn(ASSET_VISIBILITIES)
  visibility?: AssetVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  cover_asset_id?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LibraryMaterialDto)
  material?: LibraryMaterialDto | null;

  @IsOptional()
  @IsEmpty({ message: 'provider_refs are managed by the verified provider-binding workflow' })
  provider_refs?: never;
}
