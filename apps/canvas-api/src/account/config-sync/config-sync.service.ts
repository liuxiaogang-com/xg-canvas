import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { canonicaliseCapability, canonicaliseTaskType } from '@xgcanvas/shared-types';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

import { resolveConfigRoot } from '../registry/yaml-loader';
import { validateProviderFile } from '../registry/manifest-validator';
import { ModelProvider } from '../provider/provider.entity';
import { ModelChannel } from '../channel/channel.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import type {
  ChannelConfig,
  ModelConfig,
  ProviderConfigFile,
  SchemaTemplate,
  SyncResult,
} from './config-sync.types';
import { resolveAllowedChannelIds } from './channel-ref.util';
import { resolveParamSchema } from './schema-merge.util';

export type { SyncResult } from './config-sync.types';

@Injectable()
export class ConfigSyncService {
  private readonly logger = new Logger(ConfigSyncService.name);
  private templateCache = new Map<string, any>();

  constructor(
    @InjectRepository(ModelProvider)
    private readonly providerRepo: Repository<ModelProvider>,
    @InjectRepository(ModelChannel)
    private readonly channelRepo: Repository<ModelChannel>,
    @InjectRepository(ModelDefinition)
    private readonly modelRepo: Repository<ModelDefinition>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 从 YAML 配置文件同步到数据库
   * @param configDir 配置目录路径（默认: <project>/config）
   * @param dryRun 仅预览不执行
   */
  async syncFromConfig(configDir?: string, dryRun = false): Promise<SyncResult> {
    const baseDir =
      configDir || resolveConfigRoot(this.configService.get<string>('XGCANVAS_CONFIG_ROOT'));
    const providerDir = path.join(baseDir, 'model-providers');
    const templateDir = path.join(baseDir, 'schema-templates');

    const result: SyncResult = {
      providers: { created: 0, updated: 0, skipped: 0 },
      channels: { created: 0, updated: 0, skipped: 0 },
      models: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    // 1. 预加载所有 Schema 模板
    await this.loadTemplates(templateDir);

    // 2. 读取所有 Provider 配置文件
    let files: string[];
    try {
      const entries = await fs.readdir(providerDir);
      files = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch (err) {
      result.errors.push(`无法读取配置目录 ${providerDir}: ${err}`);
      return result;
    }

    this.logger.log(`发现 ${files.length} 个配置文件，${this.templateCache.size} 个模板`);

    // 3. 逐个同步
    for (const file of files) {
      const filePath = path.join(providerDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const raw = yaml.load(content);
        const validated = validateProviderFile(filePath, raw);
        if (!validated.ok) {
          result.errors.push(`${file}: ${validated.failure.message}`);
          continue;
        }
        const config = validated.data as unknown as ProviderConfigFile;

        if (!config?.provider?.slug) {
          result.errors.push(`${file}: 缺少 provider.slug`);
          continue;
        }

        if (dryRun) {
          this.logger.log(`[DRY RUN] 将同步: ${config.provider.slug} (${file})`);
          continue;
        }

        await this.syncProvider(config, filePath, result);
      } catch (err) {
        result.errors.push(`${file}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(
      `同步完成: Providers(+${result.providers.created}/~${result.providers.updated}), ` +
        `Channels(+${result.channels.created}/~${result.channels.updated}), ` +
        `Models(+${result.models.created}/~${result.models.updated}), ` +
        `Errors: ${result.errors.length}`,
    );

    return result;
  }

  /**
   * 加载所有 Schema 模板
   */
  private async loadTemplates(templateDir: string): Promise<void> {
    this.templateCache.clear();

    try {
      const entries = await fs.readdir(templateDir);
      const files = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

      for (const file of files) {
        const content = await fs.readFile(path.join(templateDir, file), 'utf-8');
        const template = yaml.load(content) as SchemaTemplate;
        if (template?.template_id) {
          this.templateCache.set(template.template_id, template.schema);
          this.logger.debug(`加载模板: ${template.template_id}`);
        }
      }
    } catch (err) {
      this.logger.warn(`加载模板目录失败: ${err}`);
    }
  }

  /**
   * 同步单个 Provider 及其 Channels 和 Models
   */
  private async syncProvider(
    config: ProviderConfigFile,
    filePath: string,
    result: SyncResult,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ---- Provider ----
      let provider = await this.providerRepo.findOne({
        where: { slug: config.provider.slug },
      });

      if (provider) {
        // 更新已有 Provider
        Object.assign(provider, {
          display_name: config.provider.display_name,
          icon_url: config.provider.icon_url ?? provider.icon_url,
          homepage_url: config.provider.homepage_url ?? provider.homepage_url,
          base_url: config.provider.base_url ?? provider.base_url,
          auth_method: config.provider.auth_method ?? provider.auth_method,
          invocation_methods: config.provider.invocation_methods ?? provider.invocation_methods,
          adapter_keys: config.provider.adapter_keys ?? provider.adapter_keys,
          sdk_package: config.provider.sdk_package ?? provider.sdk_package,
          supported_regions: config.provider.supported_regions ?? provider.supported_regions,
          description: config.provider.description ?? provider.description,
          documentation_url: config.provider.documentation_url ?? provider.documentation_url,
          source: 'config_file',
          config_file_path: filePath,
        });
        provider = await queryRunner.manager.save(provider);
        result.providers.updated++;
      } else {
        // 新建 Provider
        provider = queryRunner.manager.create(ModelProvider, {
          slug: config.provider.slug,
          display_name: config.provider.display_name,
          icon_url: config.provider.icon_url,
          homepage_url: config.provider.homepage_url,
          base_url: config.provider.base_url,
          auth_method: config.provider.auth_method || 'api_key',
          invocation_methods: config.provider.invocation_methods ?? ['http'],
          adapter_keys: config.provider.adapter_keys ?? [],
          sdk_package: config.provider.sdk_package,
          supported_regions: config.provider.supported_regions || [],
          description: config.provider.description,
          documentation_url: config.provider.documentation_url,
          source: 'config_file',
          config_file_path: filePath,
        });
        provider = await queryRunner.manager.save(provider);
        result.providers.created++;
      }

      // ---- Channels ----
      if (config.channels) {
        for (const channelConfig of config.channels) {
          await this.syncChannel(queryRunner, provider, channelConfig, result);
        }
      }

      // ---- Models ----
      if (config.models) {
        for (const modelConfig of config.models) {
          await this.syncModel(queryRunner, provider, modelConfig, result);
        }
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 同步单个 Channel
   */
  private async syncChannel(
    queryRunner: any,
    provider: ModelProvider,
    config: ChannelConfig,
    result: SyncResult,
  ): Promise<void> {
    let channel = await this.channelRepo.findOne({
      where: { provider_id: provider.id, slug: config.slug },
    });

    const channelData = {
      slug: config.slug,
      display_name: config.display_name,
      invocation_method: config.invocation_method,
      // Channel inherits the provider's base_url when it doesn't override one,
      // so the adapter doesn't fall back to its hardcoded vendor default.
      base_url: config.base_url ?? provider.base_url,
      request_config: config.request_config || {},
      load_balance_strategy: config.load_balance_strategy || 'round_robin',
      weight: config.weight ?? 100,
      rate_limit_rpm: config.rate_limit_rpm,
      rate_limit_tpm: config.rate_limit_tpm,
      daily_quota: config.daily_quota,
      concurrent_limit: config.concurrent_limit ?? 10,
      source: 'config_file' as const,
    };

    if (channel) {
      Object.assign(channel, channelData);
      channel = await queryRunner.manager.save(channel);
      result.channels.updated++;
    } else {
      channel = queryRunner.manager.create(ModelChannel, {
        provider_id: provider.id,
        ...channelData,
      });
      channel = await queryRunner.manager.save(channel);
      result.channels.created++;
    }
  }

  /**
   * 同步单个 Model Definition
   */
  private async syncModel(
    queryRunner: any,
    provider: ModelProvider,
    config: ModelConfig,
    result: SyncResult,
  ): Promise<void> {
    // 解析 param_schema（处理 extends 模板继承）
    const resolvedSchema = resolveParamSchema(config.param_schema, this.templateCache, this.logger);

    let model = await this.modelRepo.findOne({
      where: { model_id: config.model_id },
    });

    const modelData = {
      model_id: config.model_id,
      provider_model_id: config.provider_model_id,
      display_name: config.display_name,
      description: config.description,
      task_types: (config.task_types ?? []).map(canonicaliseTaskType),
      capabilities: (config.capabilities ?? []).map(canonicaliseCapability),
      invocation_mode: config.invocation_mode || 'sync',
      adapter_key: config.adapter_key ?? null,
      supports_streaming: config.supports_streaming ?? false,
      allowed_channel_ids: await resolveAllowedChannelIds(queryRunner, provider, config),
      tags: config.tags || [],
      deprecated: config.deprecated ?? false,
      deprecated_message: config.deprecated_message,
      param_schema: resolvedSchema,
      param_constraints: config.param_constraints || [],
      input_contract: config.input_contract || {},
      poll_policy: config.poll_policy || {},
      limits: config.limits || {},
      pricing: config.pricing || {},
      source: 'config_file' as const,
    };

    if (model) {
      Object.assign(model, modelData);
      await queryRunner.manager.save(model);
      result.models.updated++;
    } else {
      model = queryRunner.manager.create(ModelDefinition, {
        provider_id: provider.id,
        ...modelData,
      });
      await queryRunner.manager.save(model);
      result.models.created++;
    }
  }
}
