import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ArrayContains } from 'typeorm';
import { ModelDefinition } from './model-definition.entity';
import { CredentialService } from '../credential/credential.service';
import type { ModelInputContract } from '@xgcanvas/shared-types';
import { parseOptionalModelInputContract } from './model-input-contract.schema';

export interface ModelListItem {
  model_id: string;
  display_name: string;
  description: string;
  provider: {
    slug: string;
    display_name: string;
    icon_url: string;
  };
  task_types: string[];
  capabilities: string[];
  invocation_mode: string;
  supports_streaming: boolean;
  tags: string[];
  deprecated: boolean;
  deprecated_message?: string;
  input_contract?: ModelInputContract;
  pricing_summary?: string;
}

export interface ModelListFilter {
  taskType?: string;
  capabilities?: string[];
}

@Injectable()
export class ModelListService {
  private readonly logger = new Logger(ModelListService.name);

  constructor(
    @InjectRepository(ModelDefinition)
    private readonly modelRepo: Repository<ModelDefinition>,
    private readonly credentials: CredentialService,
  ) {}

  /**
   * 获取可用模型列表（按任务类型和能力筛选）
   * Only includes models whose provider has at least one enabled credential.
   */
  async getAvailableModels(filter: ModelListFilter): Promise<ModelListItem[]> {
    const qb = this.modelRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.provider', 'p')
      .where('m.enabled = :enabled', { enabled: true })
      .andWhere('p.enabled = :providerEnabled', { providerEnabled: true })
      .orderBy('p.sort_order', 'ASC')
      .addOrderBy('m.sort_order', 'ASC')
      .addOrderBy('m.display_name', 'ASC');

    // 按任务类型筛选
    if (filter.taskType) {
      qb.andWhere(':taskType = ANY(m.task_types)', { taskType: filter.taskType });
    }

    // 按能力筛选（要求全部包含）
    if (filter.capabilities?.length) {
      for (let i = 0; i < filter.capabilities.length; i++) {
        qb.andWhere(`:cap${i} = ANY(m.capabilities)`, { [`cap${i}`]: filter.capabilities[i] });
      }
    }

    const models = await qb.getMany();

    // Only include models whose provider has at least one enabled credential.
    const activeProviders = await this.credentials.getProviderSlugsWithCredentials();

    return models.flatMap((m) => {
      if (!m.provider || !activeProviders.has(m.provider.slug)) return [];
      const inputContract = parseOptionalModelInputContract(m.input_contract);
      if (!inputContract.success) {
        this.logger.warn(
          `model ${m.model_id} hidden because input_contract is invalid: ${inputContract.message}`,
        );
        return [];
      }
      return [
        {
          model_id: m.model_id,
          display_name: m.display_name,
          description: m.description || '',
          provider: {
            slug: m.provider.slug,
            display_name: m.provider.display_name,
            icon_url: m.provider.icon_url || '',
          },
          task_types: m.task_types,
          capabilities: m.capabilities,
          invocation_mode: m.invocation_mode,
          supports_streaming: m.supports_streaming,
          tags: m.tags,
          deprecated: m.deprecated,
          deprecated_message: m.deprecated_message || undefined,
          input_contract: inputContract.data,
          pricing_summary: this.formatPricingSummary(m.pricing),
        },
      ];
    });
  }

  /**
   * 获取模型详情（含 Schema 和约束）
   */
  async getModelDetail(modelId: string): Promise<ModelDefinition | null> {
    const model = await this.modelRepo.findOne({
      where: { model_id: modelId, enabled: true },
      relations: ['provider'],
    });
    if (!model?.provider?.enabled) return null;
    const activeProviders = await this.credentials.getProviderSlugsWithCredentials();
    if (!activeProviders.has(model.provider.slug)) return null;
    const inputContract = parseOptionalModelInputContract(model.input_contract);
    if (!inputContract.success) {
      this.logger.warn(
        `model ${model.model_id} hidden because input_contract is invalid: ${inputContract.message}`,
      );
      return null;
    }
    model.input_contract = inputContract.data ?? { modes: [] };
    return model;
  }

  /**
   * 估算费用
   */
  estimateCost(
    model: ModelDefinition,
    params: Record<string, any>,
    inputTextLength?: number,
  ): { estimated_credits: number; breakdown: string } {
    const pricing = model.pricing;
    if (!pricing || !pricing.unit) {
      return { estimated_credits: 0, breakdown: '该模型暂无定价信息' };
    }

    switch (pricing.unit) {
      case 'token': {
        const estimatedInputTokens = inputTextLength ? Math.ceil(inputTextLength / 3) : 1000;
        const estimatedOutputTokens = params.max_tokens || 1000;
        const inputCost = (estimatedInputTokens / 1000) * (pricing.input_price_per_1k || 0);
        const outputCost = (estimatedOutputTokens / 1000) * (pricing.output_price_per_1k || 0);
        const total = inputCost + outputCost;
        return {
          estimated_credits: Math.ceil(total * 100) / 100,
          breakdown: `预计 ~${estimatedInputTokens} 输入 + ~${estimatedOutputTokens} 输出 tokens`,
        };
      }

      case 'image': {
        const price =
          pricing.hd_price && params.quality === 'hd'
            ? pricing.hd_price
            : pricing.standard_price || pricing.price_per_image || 0;
        return {
          estimated_credits: price,
          breakdown: `单张图片生成`,
        };
      }

      case 'second': {
        const duration = params.duration || 5;
        const cost = duration * (pricing.price_per_second || 0);
        return {
          estimated_credits: Math.ceil(cost * 100) / 100,
          breakdown: `${duration} 秒视频生成`,
        };
      }

      default:
        return { estimated_credits: 0, breakdown: '暂无定价信息' };
    }
  }

  /**
   * 格式化定价摘要（用于列表展示）
   */
  private formatPricingSummary(pricing: Record<string, any>): string {
    if (!pricing?.unit) return '';

    const currency = pricing.currency === 'CNY' ? '¥' : '$';

    switch (pricing.unit) {
      case 'token':
        return `${currency}${pricing.input_price_per_1k || '?'}/1K tokens`;
      case 'image':
        return `${currency}${pricing.standard_price || pricing.price_per_image || '?'}/张`;
      case 'second':
        return `${currency}${pricing.price_per_second || '?'}/秒`;
      default:
        return '';
    }
  }
}
