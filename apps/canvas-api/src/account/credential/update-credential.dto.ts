import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class UpdateCredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  /** If provided, will re-encrypt and replace the stored payload */
  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsDateString()
  expires_at?: string;
}
