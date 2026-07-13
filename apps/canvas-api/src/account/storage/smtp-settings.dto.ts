import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsString() host: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsBoolean() secure?: boolean;
  @IsString() from: string;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() pass?: string;
}
