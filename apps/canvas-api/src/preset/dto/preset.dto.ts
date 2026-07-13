import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import type { PresetSegment } from '../../database/entities';

class PresetSegmentDto implements PresetSegment {
  @IsIn(['system', 'user', 'assistant'])
  role: 'system' | 'user' | 'assistant';

  @IsString()
  text: string;
}

export class CreatePresetDto {
  @IsString()
  task_type: string;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PresetSegmentDto)
  content: PresetSegmentDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class UpdatePresetDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PresetSegmentDto)
  @IsOptional()
  content?: PresetSegmentDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
