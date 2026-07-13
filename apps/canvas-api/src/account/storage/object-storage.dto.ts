import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateObjectStorageDto {
  @IsString() @IsNotEmpty() @MaxLength(500) endpoint: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsBoolean() use_ssl?: boolean;
  @IsOptional() @IsBoolean() force_path_style?: boolean;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) bucket: string;
  @IsOptional() @IsString() @MaxLength(500) browser_s3_endpoint?: string;
  /** @deprecated Compatibility alias; use browser_s3_endpoint. */
  @IsOptional() @IsString() @MaxLength(500) browser_endpoint?: string;
  /** @deprecated Compatibility alias; use browser_s3_endpoint. */
  @IsOptional() @IsString() @MaxLength(500) public_host?: string;
  @IsOptional() @IsString() @MaxLength(500) access_key?: string;
  @IsOptional() @IsString() @MaxLength(500) secret_key?: string;
}
