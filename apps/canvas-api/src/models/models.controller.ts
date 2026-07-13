import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { validateParams } from '@xgcanvas/constraint-engine';

import type { ModelListItem } from '../account/model-definition/model-list.service';
import { ModelListService } from '../account/model-definition/model-list.service';
import { DemoModelRegistry } from './demo-model-registry';
import { paramSchemaToParamSpecs } from './param-schema';
import { ModelParamsDto } from './dto';
import type { CostEstimate, ModelSchemaResponse, RichModelSummary, ValidateParamsResult } from './model.types';

/**
 * Model read API consumed by the canvas inline form (list / schema / cost /
 * validate). Model ids contain '/' (e.g. jimeng/text-v1), so the id is passed
 * via query/body rather than a path param. In DEMO_MODE everything is served
 * by DemoModelRegistry (no account-api dependency); otherwise list falls back
 * to the account registry snapshot and the rich endpoints are filled in by the
 * account->canvas merge (M5 plan §4).
 */
@Controller('models')
export class ModelsController {
  private readonly demoMode: boolean;

  constructor(
    private readonly modelList: ModelListService,
    private readonly demo: DemoModelRegistry,
    config: ConfigService,
  ) {
    this.demoMode = config.get<string>('DEMO_MODE', 'false') === 'true';
  }

  @Get()
  async list(@Query('task_type') taskType?: string): Promise<RichModelSummary[]> {
    if (this.demoMode) return this.demo.list(taskType);
    const models = await this.modelList.getAvailableModels({ taskType });
    return models.map(toRichModel);
  }

  @Get('schema')
  async schema(@Query('id') id: string): Promise<ModelSchemaResponse> {
    if (this.demoMode) {
      const s = this.demo.schema(id);
      if (!s) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: id });
      return s;
    }
    const m = await this.modelList.getModelDetail(id);
    if (!m) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: id });
    return {
      model_id: m.model_id,
      params: paramSchemaToParamSpecs(m.param_schema as { properties?: Record<string, unknown> }),
      defaults: (m.param_schema?.defaults as Record<string, unknown>) ?? {},
      input_contract: m.input_contract,
    };
  }

  @Post('estimate-cost')
  async estimateCost(@Body() body: ModelParamsDto): Promise<CostEstimate> {
    if (this.demoMode) return this.demo.estimateCost(body.model_id, body.params ?? {});
    const m = await this.modelList.getModelDetail(body.model_id);
    if (!m) return { estimated_credits: 0, currency: 'credits', breakdown: '' };
    const e = this.modelList.estimateCost(m, body.params ?? {});
    return { estimated_credits: e.estimated_credits, currency: 'credits', breakdown: e.breakdown };
  }

  @Post('validate-params')
  async validate(@Body() body: ModelParamsDto): Promise<ValidateParamsResult> {
    if (this.demoMode) return this.demo.validateParams(body.model_id, body.params ?? {});
    const m = await this.modelList.getModelDetail(body.model_id);
    if (!m) throw new NotFoundException({ code: 'MODEL_NOT_FOUND', message: body.model_id });
    const r = validateParams(body.params ?? {}, m.param_schema, m.param_constraints);
    return { ok: r.valid, errors: r.errors.map((x) => ({ field: x.field, message: x.message })) };
  }
}

function toRichModel(m: ModelListItem): RichModelSummary {
  return {
    id: m.model_id,
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
    input_contract: m.input_contract,
    pricing_summary: m.pricing_summary ?? '',
  };
}
