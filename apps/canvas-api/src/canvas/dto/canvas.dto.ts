import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class ViewportDto {
  @IsNumber() x: number;
  @IsNumber() y: number;
  @IsNumber() zoom: number;
}

export class UpdateCanvasDto {
  @IsObject()
  @ValidateNested()
  @Type(() => ViewportDto)
  @IsOptional()
  viewport?: ViewportDto;

  @IsString()
  @IsOptional()
  name?: string;

  /** Optimistic concurrency: pass the version we last saw. */
  @IsNumber()
  @IsOptional()
  if_match_version?: number;
}

export class CreateNodeDto {
  @IsString()
  type: string;

  @IsObject()
  position: { x: number; y: number };

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  layout_zones?: Record<string, unknown>;
}

export class UpdateNodeDto {
  @IsObject()
  @IsOptional()
  position?: { x: number; y: number };

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  layout_zones?: Record<string, unknown>;
}

export class CreateEdgeDto {
  @IsUUID()
  source_node_id: string;

  @IsString()
  source_handle: string;

  @IsUUID()
  target_node_id: string;

  @IsString()
  target_handle: string;

  @IsString()
  data_type: string;
}

class ReplaceNodeDto {
  @IsString() id: string;
  @IsString() type: string;
  @IsObject() position: { x: number; y: number };
  @IsObject() @IsOptional() data?: Record<string, unknown>;
  @IsObject() @IsOptional() layout_zones?: Record<string, unknown>;
}

class ReplaceEdgeDto {
  @IsString() id: string;
  @IsString() source_node_id: string;
  @IsString() source_handle: string;
  @IsString() target_node_id: string;
  @IsString() target_handle: string;
  @IsString() data_type: string;
}

/** Full-canvas replace: the client sends its entire authoritative state and the
 *  server upserts every node/edge by id then prunes anything not present. Lets
 *  the client (incl. undo/redo) be the source of truth with stable ids. */
export class ReplaceCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplaceNodeDto)
  nodes: ReplaceNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplaceEdgeDto)
  edges: ReplaceEdgeDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => ViewportDto)
  @IsOptional()
  viewport?: ViewportDto;
}

export class CanvasBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateNodePatchDto)
  @IsOptional()
  node_updates?: UpdateNodePatchDto[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  delete_node_ids?: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  delete_edge_ids?: string[];
}

class UpdateNodePatchDto extends UpdateNodeDto {
  @IsUUID()
  id: string;
}
