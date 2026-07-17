import { OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CreateProviderDto } from './create-provider.dto';

export class UpdateProviderDto extends PartialType(OmitType(CreateProviderDto, ['slug'] as const)) {
  @IsOptional()
  @IsInt()
  @Min(1)
  expected_revision?: number;

  @IsOptional()
  @IsArray()
  @IsIn(['base_url', 'auth_config'], { each: true })
  reset_config_overrides?: string[];
}
