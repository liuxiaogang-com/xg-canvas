import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  MaxLength,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreateCredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsIn(['api_key', 'cli_session'])
  credential_type: 'api_key' | 'cli_session';

  /** Plaintext credential payload — will be encrypted before storage */
  @IsObject()
  credentials: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
