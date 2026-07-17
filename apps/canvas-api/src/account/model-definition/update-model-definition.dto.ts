import { OmitType, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CreateModelDefinitionDto } from './create-model-definition.dto';

export class UpdateModelDefinitionDto extends PartialType(
  OmitType(CreateModelDefinitionDto, ['provider_resource_uid', 'model_id'] as const),
) {
  @IsOptional()
  @IsInt()
  @Min(1)
  expected_revision?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expected_rate_revision?: number;

  @IsOptional()
  @IsIn(['active', 'deprecated'])
  lifecycle?: 'active' | 'deprecated';
}
