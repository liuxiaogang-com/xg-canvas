import { Controller, Get, Param, Query, Post, Body, NotFoundException } from '@nestjs/common';
import { ModelListService } from './model-list.service';
import { validateParams } from '@xgcanvas/constraint-engine';

import { Public } from '../../common/decorators/public.decorator';

/**
 * 面向画布的公开 API
 * 节点通过这些接口加载模型列表和参数 Schema
 */
@Public()
@Controller('api/models')
export class ModelListController {
  constructor(private readonly modelListService: ModelListService) {}

  /**
   * 获取模型列表（按任务类型筛选）
   * 画布节点用：GET /api/models?task_type=video_generation
   */
  @Get()
  async listModels(
    @Query('task_type') taskType?: string,
    @Query('capabilities') capabilities?: string,
  ) {
    const capList = capabilities ? capabilities.split(',') : undefined;
    const models = await this.modelListService.getAvailableModels({
      taskType,
      capabilities: capList,
    });
    return { models };
  }

  /**
   * 获取模型参数 Schema
   * 节点选择模型后调用：GET /api/models/:modelId/schema
   */
  @Get(':modelId/schema')
  async getModelSchema(@Param('modelId') modelId: string) {
    const model = await this.modelListService.getModelDetail(modelId);
    if (!model) {
      throw new NotFoundException(`模型 ${modelId} 不存在`);
    }
    return {
      model_id: model.model_id,
      param_schema: model.param_schema,
      param_constraints: model.param_constraints,
      input_contract: model.input_contract,
      limits: model.limits,
      defaults: model.param_schema?.defaults || {},
    };
  }

  /**
   * 校验参数
   * 提交执行前调用：POST /api/models/:modelId/validate-params
   */
  @Post(':modelId/validate-params')
  async validateModelParams(
    @Param('modelId') modelId: string,
    @Body() body: { params: Record<string, any> },
  ) {
    const model = await this.modelListService.getModelDetail(modelId);
    if (!model) {
      throw new NotFoundException(`模型 ${modelId} 不存在`);
    }

    const result = validateParams(
      body.params,
      model.param_schema,
      model.param_constraints,
    );

    return result;
  }

  /**
   * 估算费用
   * POST /api/models/:modelId/estimate-cost
   */
  @Post(':modelId/estimate-cost')
  async estimateCost(
    @Param('modelId') modelId: string,
    @Body() body: { params: Record<string, any>; input_text_length?: number },
  ) {
    const model = await this.modelListService.getModelDetail(modelId);
    if (!model) {
      throw new NotFoundException(`模型 ${modelId} 不存在`);
    }

    const estimate = this.modelListService.estimateCost(model, body.params, body.input_text_length);
    return estimate;
  }
}
