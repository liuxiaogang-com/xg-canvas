import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  @IsOptional()
  conversation_id?: string;

  @IsString()
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
