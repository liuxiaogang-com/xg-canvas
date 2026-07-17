import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';

export class ForkModelDefinitionDto {
  @IsInt()
  @Min(1)
  expected_source_revision: number;

  @IsString()
  @MaxLength(MAX_MODEL_ID_LENGTH)
  new_model_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  display_name?: string;
}
