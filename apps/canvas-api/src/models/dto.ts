import { IsObject, IsOptional, IsString } from 'class-validator';

/** Body for POST /models/estimate-cost and /models/validate-params. */
export class ModelParamsDto {
  @IsString()
  model_id!: string;

  @IsObject()
  @IsOptional()
  params?: Record<string, unknown>;
}
