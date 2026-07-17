import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';

export class SendMessageDto {
  @IsUUID()
  @IsOptional()
  conversation_id?: string;

  @IsString()
  @MaxLength(MAX_MODEL_ID_LENGTH)
  model_id!: string;

  @IsString()
  message!: string;

  @IsString()
  @IsOptional()
  system_prompt?: string;

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @IsOptional()
  max_tokens?: number;
}
