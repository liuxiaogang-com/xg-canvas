import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';

const VENDOR_CONTRACT_PROFILES = ['openai-text-chat-stream'] as const;

export class VendorModelsQueryDto {
  @IsUUID()
  channel_resource_uid: string;

  @IsIn(VENDOR_CONTRACT_PROFILES)
  contract_profile: string;
}

export class ProbeVendorModelsDto extends VendorModelsQueryDto {
  @IsString()
  @Length(1, 8192)
  api_key: string;
}

export class ImportVendorModelsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_MODEL_ID_LENGTH, { each: true })
  vendor_model_ids: string[];

  @IsUUID()
  channel_resource_uid: string;

  @IsIn(VENDOR_CONTRACT_PROFILES)
  contract_profile: string;
}

export class AddCredentialWithModelsDto {
  @IsUUID()
  provider_resource_uid: string;

  @IsUUID()
  channel_resource_uid: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  label?: string;

  @IsObject()
  payload: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(MAX_MODEL_ID_LENGTH, { each: true })
  vendor_model_ids?: string[];

  @ValidateIf((dto: AddCredentialWithModelsDto) => Boolean(dto.vendor_model_ids?.length))
  @IsIn(VENDOR_CONTRACT_PROFILES)
  vendor_model_profile?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  preset_model_resource_uids?: string[];
}
