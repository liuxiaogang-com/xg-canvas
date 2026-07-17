import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class UpsertFeatureConfigDto {
  @IsString()
  @Length(1, 100)
  feature_key: string;

  @IsString()
  @Length(1, 200)
  display_name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  model_resource_uids: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
