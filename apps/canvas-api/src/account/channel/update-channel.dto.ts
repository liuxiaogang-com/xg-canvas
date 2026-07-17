import { OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CreateChannelDto } from './create-channel.dto';

const CHANNEL_OVERRIDE_KEYS = [
  'base_url',
  'request_config',
] as const;

export class UpdateChannelDto extends PartialType(OmitType(CreateChannelDto, ['slug'] as const)) {
  @IsOptional()
  @IsInt()
  @Min(1)
  expected_revision?: number;

  @IsOptional()
  @IsArray()
  @IsIn(CHANNEL_OVERRIDE_KEYS, { each: true })
  reset_config_overrides?: string[];
}
