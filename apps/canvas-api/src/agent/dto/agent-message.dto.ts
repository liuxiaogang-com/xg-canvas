import { Type } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class NodeContextDto {
  @IsUUID()
  id: string;

  @IsString()
  type: string;

  @IsObject()
  data: Record<string, unknown>;
}

export class AgentMessageDto {
  @IsUUID()
  project_id: string;

  @IsUUID()
  @IsOptional()
  session_id?: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  model_id?: string;

  /** The currently selected node, if any. */
  @ValidateNested()
  @Type(() => NodeContextDto)
  @IsOptional()
  node_context?: NodeContextDto;

  /** Prior assistant turns to keep continuity. */
  @IsArray()
  @IsOptional()
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
