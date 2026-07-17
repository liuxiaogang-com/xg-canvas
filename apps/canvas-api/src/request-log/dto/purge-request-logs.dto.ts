import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PurgeRequestLogsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  before_days?: number;

  @IsOptional()
  @IsIn(['success', 'error', 'timeout', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider_slug?: string;
}
