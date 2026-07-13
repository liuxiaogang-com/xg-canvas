import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

const ENTITY_TYPES = ['character', 'scene', 'prop', 'storyboard'] as const;

export class CreateEntityDto {
  @IsUUID()
  project_id: string;

  @IsIn(ENTITY_TYPES)
  type: (typeof ENTITY_TYPES)[number];

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  ref_asset_ids?: string[];
}

export class UpdateEntityDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  ref_asset_ids?: string[];

  @IsUUID()
  @IsOptional()
  generated_asset_id?: string | null;

  /** Link (uuid) or unlink (null) a reusable library entry. */
  @IsOptional()
  @ValidateIf((o) => o.library_entry_id !== null)
  @IsUUID()
  library_entry_id?: string | null;
}
