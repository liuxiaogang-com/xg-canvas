import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ScriptActionDto {
  @IsUUID()
  project_id: string;

  @IsUUID()
  script_node_id: string;

  @IsString()
  @MaxLength(20_000)
  raw_text: string;

  @IsString()
  @IsOptional()
  model_id?: string;
}
