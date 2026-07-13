import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ModelChannel } from '../channel/channel.entity';
import { ModelProvider } from '../provider/provider.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';
import { RegistryBootstrapService } from '../registry/registry-bootstrap.service';
import { CredentialService, type CredentialView } from './credential.service';

export interface VendorModel {
  id: string;
  /** Already present in our model_definitions for this provider. */
  imported: boolean;
}

export interface VendorModelList {
  models: VendorModel[];
  note?: string;
}

/**
 * Pull a provider's live model catalogue (GET {base}/models) and let the operator
 * enable selected entries as manual model_definitions. Reuses CredentialService for the
 * credential -> {base, apiKey} resolution so secrets stay in one place.
 */
@Injectable()
export class ProviderModelsService {
  constructor(
    private readonly credentials: CredentialService,
    @InjectRepository(ModelProvider) private readonly providerRepo: Repository<ModelProvider>,
    @InjectRepository(ModelDefinition) private readonly modelRepo: Repository<ModelDefinition>,
    @InjectRepository(ModelChannel) private readonly channelRepo: Repository<ModelChannel>,
    private readonly registry: RegistryBootstrapService,
  ) {}

  /**
   * Probe a provider's /models with a RAW key (not yet stored) — the wizard's
   * "一键获取模型". Doubles as a connectivity check: if it returns models, the key works.
   */
  async probeModels(providerId: string, apiKey: string): Promise<VendorModelList> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);
    if (!apiKey) return { models: [], note: '请先填写 key' };
    if (!provider.base_url) return { models: [], note: '该供应商未配置 base_url' };
    const fetched = await this.fetchModelIds(provider.base_url, apiKey);
    if (!fetched.ok) return { models: [], note: (fetched as { ok: false; note: string }).note };
    const imported = new Set((await this.modelRepo.find({ where: { provider_id: providerId } })).map((m) => m.provider_model_id));
    return { models: fetched.ids.map((id) => ({ id, imported: imported.has(id) })) };
  }

  /**
   * Credential-centric "add a key": ensure a default channel for the provider, create the
   * (encrypted) credential under it, and enable the selected models. The channel layer is
   * created transparently so the common path never touches it.
   */
  async addCredentialWithModels(dto: {
    provider_id: string;
    label?: string;
    payload: Record<string, string>;
    model_ids?: string[];
    preset_model_ids?: string[];
  }): Promise<{
    credential: CredentialView;
    credentials: CredentialView[];
    imported?: { created: string[]; skipped: string[] };
    enabledPresets?: number;
  }> {
    const provider = await this.providerRepo.findOne({ where: { id: dto.provider_id } });
    if (!provider) throw new NotFoundException(`Provider ${dto.provider_id} not found`);
    const channels = await this.ensureProviderChannels(provider);
    const credentials: CredentialView[] = [];
    for (const channel of channels) {
      credentials.push(
        await this.credentials.create(channel.id, {
          label: dto.label,
          credential_type: provider.auth_method === 'cli_login' ? 'cli_session' : 'api_key',
          credentials: dto.payload,
        }),
      );
    }
    const imported = dto.model_ids?.length ? await this.importModels(dto.provider_id, dto.model_ids) : undefined;

    const enabledPresets = dto.preset_model_ids?.length
      ? await this.enablePresetModels(dto.provider_id, dto.preset_model_ids)
      : 0;

    return { credential: credentials[0], credentials, imported, enabledPresets };
  }

  /** Enable only the preset models the user selected in the wizard. */
  private async enablePresetModels(providerId: string, modelIds: string[]): Promise<number> {
    if (modelIds.length === 0) return 0;
    const result = await this.modelRepo
      .createQueryBuilder()
      .update()
      .set({ enabled: true })
      .where('provider_id = :providerId', { providerId })
      .andWhere("source != 'manual'")
      .andWhere('id IN (:...modelIds)', { modelIds })
      .andWhere('enabled = false')
      .execute();
    return result.affected ?? 0;
  }

  /** Reuse provider channels, or create a default one (transparent to the user). */
  private async ensureProviderChannels(provider: ModelProvider): Promise<ModelChannel[]> {
    const existing = await this.channelRepo.find({
      where: { provider_id: provider.id, enabled: true },
      order: { priority: 'ASC', created_at: 'ASC' },
    });
    if (existing.length) return existing;
    const ch = this.channelRepo.create({
      provider_id: provider.id,
      slug: `${provider.slug}-default`,
      display_name: `${provider.display_name} 默认渠道`,
      invocation_method: provider.invocation_methods?.[0] ?? 'http',
      base_url: provider.base_url ?? null,
      source: 'manual',
    } as Partial<ModelChannel>);
    const saved = await this.channelRepo.save(ch);
    return [saved];
  }

  /** Vendor /models list, each flagged with whether we've already imported it. */
  async listVendorModels(providerId: string): Promise<VendorModelList> {
    const ctx = await this.credentials.resolveProviderApiContext(providerId);
    if (!ctx) return { models: [], note: '无可用 api_key 凭证' };
    const fetched = await this.fetchModelIds(ctx.base, ctx.apiKey);
    if (!fetched.ok) return { models: [], note: (fetched as { ok: false; note: string }).note };
    const imported = new Set((await this.modelRepo.find({ where: { provider_id: providerId } })).map((m) => m.provider_model_id));
    return { models: fetched.ids.map((id) => ({ id, imported: imported.has(id) })) };
  }

  /** Enable selected vendor models as manual model_definitions. Idempotent. */
  async importModels(providerId: string, ids: string[]): Promise<{ created: string[]; skipped: string[] }> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);
    const existing = await this.modelRepo.find({ where: { provider_id: providerId } });
    const imported = new Set(existing.map((m) => m.provider_model_id));
    const created: string[] = [];
    const skipped: string[] = [];

    for (const vid of ids) {
      const modelId = `${provider.slug}:${vid}`;
      if (imported.has(vid) || (await this.modelRepo.findOne({ where: { model_id: modelId } }))) {
        skipped.push(vid);
        continue;
      }
      // Reuse the same text-generation template the presets reference, so an imported
      // model is consistent and immediately invokable through the registry union.
      const row = this.modelRepo.create({
        provider_id: providerId,
        model_id: modelId,
        provider_model_id: vid,
        display_name: vid,
        task_types: ['gen.text'],
        capabilities: ['text_chat', 'streaming'],
        invocation_mode: 'stream',
        supports_streaming: true,
        param_schema: { extends: 'templates/text-generation' } as never,
        enabled: true,
        source: 'manual',
      } as Partial<ModelDefinition>);
      try {
        await this.modelRepo.save(row);
        created.push(vid);
      } catch (e) {
        // A concurrent import may have inserted the same model_id first (unique). Treat the
        // lost race as a skip rather than failing the whole batch.
        if (isUniqueViolation(e)) skipped.push(vid);
        else throw e;
      }
    }
    // Rebuild the runtime registry so the new manual models are immediately invokable
    // (the snapshot is preset ∪ manual). Best-effort: the rows persist regardless.
    if (created.length) {
      await this.registry.reload({ syncDb: false }).catch(() => undefined);
    }
    return { created, skipped };
  }

  private async fetchModelIds(
    base: string,
    apiKey: string,
  ): Promise<{ ok: true; ids: string[] } | { ok: false; note: string }> {
    const url = `${base.replace(/\/$/, '')}/models`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
      if (!res.ok) return { ok: false, note: `拉取失败(${res.status})` };
      const j = (await res.json()) as { data?: { id?: string }[] };
      const ids = (j.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
      return { ok: true, ids };
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Postgres unique-violation (SQLSTATE 23505), surfaced through the TypeORM driver error. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; driverError?: { code?: string } };
  return err?.code === '23505' || err?.driverError?.code === '23505';
}
