import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  defineModel,
  type ModelManifestEntry,
  type ModelRegistryEntry,
} from '@xgcanvas/adapters-contract';
import {
  canonicaliseCapability,
  canonicaliseTaskType,
  type Capability,
  type TaskType,
} from '@xgcanvas/shared-types';

import { AdapterRegistry } from '../adapters/registry';
import { ConfigSyncService } from '../config-sync/config-sync.service';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { parseOptionalModelInputContract } from '../model-definition/model-input-contract.schema';
import { RedisKeys, RedisService } from '../redis';
import {
  validateProviderFile,
  type ProviderFile,
  type ValidationFailure,
} from './manifest-validator';
import { RegistryService } from './registry.service';
import {
  loadProviderFiles,
  loadTemplates,
  resolveConfigRoot,
  resolveSchemaWithTemplate,
} from './yaml-loader';
import type { ReloadReport, RegistrySnapshot } from './types';

@Injectable()
export class RegistryBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RegistryBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly adapters: AdapterRegistry,
    private readonly registry: RegistryService,
    private readonly redis: RedisService,
    private readonly configSync: ConfigSyncService,
    @InjectRepository(ModelDefinition) private readonly modelRepo: Repository<ModelDefinition>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('REGISTRY_AUTOLOAD') === 'false') {
      this.logger.log('REGISTRY_AUTOLOAD=false — skipping bootstrap');
      return;
    }
    try {
      const r = await this.reload({ syncDb: true });
      this.logger.log(`registry loaded: ${r.loaded} models from ${r.files.length} files`);
    } catch (e) {
      this.logger.error(`registry bootstrap failed: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Re-read YAML, validate, build runtime snapshot, optionally upsert DB.
   * Throws on validation failures so /admin/registry/reload returns 422
   * without mutating the in-memory snapshot.
   */
  async reload(opts: { syncDb: boolean }): Promise<ReloadReport> {
    const root = resolveConfigRoot(this.config.get<string>('XGCANVAS_CONFIG_ROOT'));
    const [files, templates] = await Promise.all([loadProviderFiles(root), loadTemplates(root)]);

    const failures: ValidationFailure[] = [];
    const validated: { filePath: string; data: ProviderFile }[] = [];
    for (const file of files) {
      const r = validateProviderFile(file.filePath, file.raw);
      if (r.ok) validated.push({ filePath: file.filePath, data: r.data });
      else failures.push((r as { ok: false; failure: ValidationFailure }).failure);
    }
    if (failures.length > 0) {
      const summary = failures.map((f) => `${f.filePath}: ${f.message}`).join('\n');
      throw new Error(`registry validation failed:\n${summary}`);
    }

    const entries: ModelRegistryEntry[] = [];
    // provider slug -> default adapter key (from YAML), reused to resolve manual models.
    const providerAdapterBySlug = new Map<string, string | undefined>();
    for (const v of validated) {
      const providerKey = v.data.provider.slug;
      const adapterKeys = v.data.provider.adapter_keys ?? [];
      providerAdapterBySlug.set(providerKey, adapterKeys[0]);
      for (const m of v.data.models ?? []) {
        const taskTypes = (m.task_types as string[]).map(canonicaliseTaskType) as TaskType[];
        const capabilities = ((m as { capabilities?: string[] }).capabilities ?? []).map(
          canonicaliseCapability,
        ) as Capability[];
        const adapterKey =
          (m as { adapter_key?: string }).adapter_key ??
          adapterKeys[0] ??
          guessAdapterKey(providerKey, taskTypes);
        if (!this.adapters.has(adapterKey)) {
          throw new Error(`model ${m.model_id} references unknown adapter ${adapterKey}`);
        }
        const resolvedSchema = resolveSchemaWithTemplate(m.param_schema, templates);
        const manifest: ModelManifestEntry = {
          id: m.model_id,
          display_name: m.display_name,
          provider_key: providerKey,
          adapter_key: adapterKey,
          provider_model: m.provider_model_id,
          task_types: taskTypes,
          capabilities,
          invocation_mode: (m.invocation_mode ?? 'sync') as ModelManifestEntry['invocation_mode'],
          param_schema: (resolvedSchema as ModelManifestEntry['param_schema']) ?? defaultSchema(),
          input_contract: (m as { input_contract?: ModelManifestEntry['input_contract'] })
            .input_contract,
          constraints: (m.param_constraints ?? []) as ModelManifestEntry['constraints'],
          poll_policy: m.poll_policy as ModelManifestEntry['poll_policy'],
        };
        entries.push(defineModel(manifest));
      }
    }

    // Dual-source registry (铁律 #7): merge enabled source=manual models from the DB on
    // top of the YAML presets, so admin-imported / hand-added models are invokable
    // without a YAML edit. Preset ids win on collision.
    const presetIds = new Set(entries.map((e) => e.manifest.id));
    const manualEntries = await this.loadManualEntries(templates, providerAdapterBySlug, presetIds);
    entries.push(...manualEntries);

    const snapshot = buildSnapshot(entries);
    this.registry.setSnapshot(snapshot);
    await this.cacheRevision(entries.length);

    if (opts.syncDb) {
      try {
        await this.configSync.syncFromConfig(root);
      } catch (e) {
        this.logger.warn(`DB upsert failed (registry kept in memory): ${(e as Error).message}`);
      }
    }

    return {
      loaded: entries.length,
      files: validated.map((v) => v.filePath),
      errors: [],
    };
  }

  /**
   * Build registry entries from enabled source=manual model_definitions. The vendor-model
   * pull (and any hand-added model) writes these rows; this is what makes them live without
   * a YAML edit. param_schema {extends:"templates/..."} is resolved against the same
   * templates as presets; the adapter key falls back to the provider's YAML adapter.
   */
  private async loadManualEntries(
    templates: Parameters<typeof resolveSchemaWithTemplate>[1],
    providerAdapterBySlug: Map<string, string | undefined>,
    presetIds: Set<string>,
  ): Promise<ModelRegistryEntry[]> {
    const out: ModelRegistryEntry[] = [];
    let rows: ModelDefinition[];
    try {
      rows = await this.modelRepo.find({
        where: { source: 'manual', enabled: true },
        relations: ['provider'],
      });
    } catch (e) {
      this.logger.warn(`manual model load skipped: ${(e as Error).message}`);
      return out;
    }
    for (const m of rows) {
      if (presetIds.has(m.model_id)) continue; // preset wins on id collision
      const providerKey = m.provider?.slug;
      if (!providerKey) {
        this.logger.warn(`manual model ${m.model_id} has no provider slug, skipped`);
        continue;
      }
      const taskTypes = (m.task_types ?? []).map(canonicaliseTaskType) as TaskType[];
      const capabilities = (m.capabilities ?? []).map(canonicaliseCapability) as Capability[];
      const adapterKey =
        m.adapter_key ??
        providerAdapterBySlug.get(providerKey) ??
        guessAdapterKey(providerKey, taskTypes);
      if (!this.adapters.has(adapterKey)) {
        this.logger.warn(
          `manual model ${m.model_id} references unknown adapter ${adapterKey}, skipped`,
        );
        continue;
      }
      const inputContract = parseOptionalModelInputContract(m.input_contract);
      if (!inputContract.success) {
        this.logger.warn(
          `manual model ${m.model_id} has invalid input_contract, skipped: ${inputContract.message}`,
        );
        continue;
      }
      const resolvedSchema = resolveSchemaWithTemplate(m.param_schema, templates);
      const manifest: ModelManifestEntry = {
        id: m.model_id,
        display_name: m.display_name,
        provider_key: providerKey,
        adapter_key: adapterKey,
        provider_model: m.provider_model_id,
        task_types: taskTypes,
        capabilities,
        invocation_mode: (m.invocation_mode ?? 'sync') as ModelManifestEntry['invocation_mode'],
        param_schema: (resolvedSchema as ModelManifestEntry['param_schema']) ?? defaultSchema(),
        input_contract: inputContract.data,
        constraints: (m.param_constraints ?? []) as ModelManifestEntry['constraints'],
        poll_policy: m.poll_policy as ModelManifestEntry['poll_policy'],
      };
      out.push(defineModel(manifest));
    }
    if (out.length) this.logger.log(`registry merged ${out.length} manual model(s) from DB`);
    return out;
  }

  private async cacheRevision(count: number): Promise<void> {
    try {
      await this.redis.set(
        RedisKeys.registry.revision(),
        JSON.stringify({ at: new Date().toISOString(), count }),
      );
    } catch (e) {
      this.logger.warn(`redis cache write skipped: ${(e as Error).message}`);
    }
  }
}

function buildSnapshot(entries: ModelRegistryEntry[]): RegistrySnapshot {
  const byId = new Map<string, ModelRegistryEntry>();
  const byTaskType = new Map<TaskType, ModelRegistryEntry[]>();
  const byProvider = new Map<string, ModelRegistryEntry[]>();
  for (const e of entries) {
    byId.set(e.manifest.id, e);
    for (const t of e.manifest.task_types) {
      const list = byTaskType.get(t) ?? [];
      list.push(e);
      byTaskType.set(t, list);
    }
    const pList = byProvider.get(e.manifest.provider_key) ?? [];
    pList.push(e);
    byProvider.set(e.manifest.provider_key, pList);
  }
  return {
    byId,
    byTaskType,
    byProvider,
    loaded_at: new Date().toISOString(),
  };
}

function defaultSchema(): ModelManifestEntry['param_schema'] {
  return {
    version: '1.0',
    groups: [],
    properties: {},
    required: [],
    defaults: {},
  };
}

function guessAdapterKey(providerKey: string, taskTypes: string[]): string {
  if (providerKey === 'doubao' && taskTypes.some((t) => t.includes('video'))) return 'doubao-video';
  if (providerKey === 'doubao' && taskTypes.some((t) => t.includes('image'))) return 'doubao-image';
  if (providerKey === 'dreamina') return 'dreamina-cli';
  return 'openai-compat';
}
