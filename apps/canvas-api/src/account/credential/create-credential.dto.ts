import { IsString, IsOptional, IsBoolean, IsObject, MaxLength, IsDateString } from 'class-validator';

export class CreateCredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsString()
  @MaxLength(30)
  credential_type: string;

  /** Plaintext credential payload — will be encrypted before storage */
  @IsObject()
  credentials: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @IsBoolean()
  auto_refresh?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  created_by?: string;
}
