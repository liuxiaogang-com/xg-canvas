import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';

import { validateParams } from '@xgcanvas/constraint-engine';

import { AccountModelsClient, type AccountModelListItem } from '../account-client';
import { paramSchemaToParamSpecs } from './param-schema';
import { ModelParamsDto } from './dto';
import type {
  CostEstimate,
  ModelSchemaResponse,
  RichModelSummary,
  ValidateParamsResult,
} from './model.types';

/**
 * Model read API consumed by the canvas inline form (list / schema / cost /
 * validate). Model ids may contain '/' (e.g. custom/vendor/model-v1), so the id is passed
 * via query/body rather than a path param. All responses use the same immutable
 * Catalog snapshot and require a currently enabled provider route and credential.
 */
@Controller('models')
export class ModelsController {
  constructor(private readonly models: AccountModelsClient) {}

  @Get()
  async list(@Query('task_type') taskType?: string): Promise<RichModelSummary[]> {
    const models = await this.models.getAvailableModels({ taskType });
    return models.map(toRichModel);
  }

  @Get('schema')
  async schema(@Query('id') id: string): Promise<ModelSchemaResponse> {
    const m = await this.models.getModelDetail(id);
    if (!m) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: id });
    return {
      model_id: m.model_id,
      model_resource_uid: m.resource_uid,
      model_revision_id: m.origin.revision_id,
      catalog_epoch: m.catalog_epoch,
      params: paramSchemaToParamSpecs(m.param_schema as { properties?: Record<string, unknown> }),
      defaults: (m.param_schema?.defaults as Record<string, unknown>) ?? {},
      input_contract: m.input_contract,
    };
  }

  @Post('estimate-cost')
  async estimateCost(@Body() body: ModelParamsDto): Promise<CostEstimate> {
    const m = await this.models.getModelDetail(body.model_id);
    if (!m) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: body.model_id });
    return this.models.estimateCost(m, body.params ?? {});
  }

  @Post('validate-params')
  async validate(@Body() body: ModelParamsDto): Promise<ValidateParamsResult> {
    const m = await this.models.getModelDetail(body.model_id);
    if (!m) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: body.model_id });
    const r = validateParams(body.params ?? {}, m.param_schema, m.param_constraints);
    return { ok: r.valid, errors: r.errors.map((x) => ({ field: x.field, message: x.message })) };
  }
}

function toRichModel(m: AccountModelListItem): RichModelSummary {
  return {
    model_id: m.model_id,
    model_resource_uid: m.model_resource_uid,
    model_revision_id: m.model_revision_id,
    catalog_epoch: m.catalog_epoch,
    display_name: m.display_name,
    description: m.description,
    provider: {
      key: m.provider.slug,
      display_name: m.provider.display_name,
      icon_url: m.provider.icon_url,
    },
    task_types: m.task_types as RichModelSummary['task_types'],
    capabilities: m.capabilities,
    invocation_mode: m.invocation_mode as RichModelSummary['invocation_mode'],
    supports_streaming: m.supports_streaming,
    tags: m.tags,
    deprecated: m.deprecated,
    deprecated_message: m.deprecated_message,
    input_contract: m.input_contract,
    pricing_summary: m.pricing_summary ?? '',
  };
}
