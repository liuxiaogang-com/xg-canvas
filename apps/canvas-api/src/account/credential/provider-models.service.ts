import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  isCatalogCurrentLifecycle,
  redactSecretText,
  type CatalogModelOffering,
} from '@xgcanvas/model-catalog';
import { guardedFetch } from '../../common/http/guarded-outbound';
import { CatalogReadService } from '../catalog';
import { RegistryBootstrapService, RegistryService } from '../registry';
import { ModelCredential } from './credential.entity';
import { assertCredentialContract } from './credential-contract';
import { presentCredential } from './credential.presenter';
import { CredentialService, type CredentialView } from './credential.service';
import { EncryptionService } from './encryption.service';
import { ProviderCatalogWritesService } from './provider-catalog-writes.service';
import {
  maxVendorModelIdLength,
  OPENAI_TEXT_VENDOR_PROFILE,
  requireVendorContractAdapter,
} from './vendor-model-contract';

const MAX_VENDOR_RESPONSE_BYTES = 1_000_000;
const MAX_VENDOR_MODELS = 500;

export interface VendorModel {
  id: string;
  imported: boolean;
}

export interface VendorModelList {
  models: VendorModel[];
  note?: string;
}

interface CredentialOnboardingInput {
  provider_resource_uid: string;
  channel_resource_uid: string;
  label?: string;
  payload: Record<string, string>;
  vendor_model_ids?: string[];
  vendor_model_profile?: string;
  preset_model_resource_uids?: string[];
}

@Injectable()
export class ProviderModelsService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly catalog: CatalogReadService,
    private readonly registry: RegistryService,
    private readonly registryBootstrap: RegistryBootstrapService,
    private readonly catalogWrites: ProviderCatalogWritesService,
    private readonly encryption: EncryptionService,
  ) {}

  async probeModels(
    providerResourceUid: string,
    channelResourceUid: string,
    apiKey: string,
    contractProfile = OPENAI_TEXT_VENDOR_PROFILE,
  ): Promise<VendorModelList> {
    if (!apiKey.trim()) return { models: [], note: '请先填写 key' };
    const route = this.requireVendorChannel(
      providerResourceUid,
      channelResourceUid,
      contractProfile,
    );
    const fetched = await this.fetchModelIds(
      route.base,
      apiKey.trim(),
      maxVendorModelIdLength(route.providerSlug),
    );
    if (!fetched.ok) return { models: [], note: fetched.note };
    return {
      models: await this.markImported(providerResourceUid, fetched.ids),
      note: ignoredModelNote(fetched.ignoredOversized),
    };
  }

  async addCredentialWithModels(dto: CredentialOnboardingInput): Promise<{
    credential: CredentialView;
    imported?: { created: string[]; skipped: string[] };
    enabledPresets: number;
  }> {
    const vendorIds = dto.vendor_model_ids ?? [];
    const presetUids = dto.preset_model_resource_uids ?? [];

    const result = await this.registryBootstrap.mutateLocal(async (manager) => {
      const prepared = await this.catalogWrites.prepareCredentialChannelInTransaction(
        manager,
        dto.provider_resource_uid,
        dto.channel_resource_uid,
        presetUids,
        dto.vendor_model_profile,
        vendorIds.length > 0,
      );
      const credentialType = credentialTypeFor(prepared.provider.document.auth_method, dto.payload);
      const encrypted = await this.encryption.encrypt(dto.payload);
      const repo = manager.getRepository(ModelCredential);
      const credential = await repo.save(
        repo.create({
          channel_resource_uid: dto.channel_resource_uid,
          label: dto.label,
          credential_type: credentialType,
          encrypted_payload: encrypted.encrypted,
          encryption_key_id: encrypted.keyId,
          payload_fields: Object.keys(dto.payload),
          enabled: true,
        }),
      );
      const imported =
        vendorIds.length > 0
          ? await this.catalogWrites.importVendorModelsInTransaction(
              manager,
              dto.provider_resource_uid,
              dto.channel_resource_uid,
              vendorIds,
              dto.vendor_model_profile,
            )
          : undefined;
      const enabledPresets = await this.catalogWrites.enableOfficialModelsInTransaction(
        manager,
        dto.provider_resource_uid,
        dto.channel_resource_uid,
        presetUids,
      );
      return { credential, imported, enabledPresets };
    });
    return {
      credential: presentCredential(result.credential),
      imported: result.imported,
      enabledPresets: result.enabledPresets,
    };
  }

  async listVendorModels(
    providerResourceUid: string,
    channelResourceUid: string,
    contractProfile = OPENAI_TEXT_VENDOR_PROFILE,
  ): Promise<VendorModelList> {
    const route = this.requireVendorChannel(
      providerResourceUid,
      channelResourceUid,
      contractProfile,
    );
    const context = await this.credentials.resolveProviderApiContext(providerResourceUid, [
      channelResourceUid,
    ]);
    if (!context) return { models: [], note: '所选渠道没有可用 api_key 凭证' };
    const fetched = await this.fetchModelIds(
      context.base,
      context.apiKey,
      maxVendorModelIdLength(route.providerSlug),
    );
    if (!fetched.ok) return { models: [], note: fetched.note };
    return {
      models: await this.markImported(providerResourceUid, fetched.ids),
      note: ignoredModelNote(fetched.ignoredOversized),
    };
  }

  async importModels(
    providerResourceUid: string,
    channelResourceUid: string,
    ids: string[],
    contractProfile?: string,
  ): Promise<{ created: string[]; skipped: string[] }> {
    this.requireVendorChannel(providerResourceUid, channelResourceUid, contractProfile);
    return this.catalogWrites.importVendorModels(
      providerResourceUid,
      channelResourceUid,
      ids,
      contractProfile,
    );
  }

  private async markImported(providerResourceUid: string, ids: string[]): Promise<VendorModel[]> {
    const models = await this.catalog.listCurrent<CatalogModelOffering>('model_offering');
    const imported = new Set(
      models
        .filter((record) => record.document.provider_uid === providerResourceUid)
        .map((record) => record.document.provider_model_id),
    );
    return ids.map((id) => ({ id, imported: imported.has(id) }));
  }

  private requireVendorChannel(
    providerResourceUid: string,
    channelResourceUid: string,
    contractProfile?: string,
  ): { base: string; providerSlug: string } {
    const { provider, channel } = this.requireVendorChannelOwnership(
      providerResourceUid,
      channelResourceUid,
    );
    const adapterKey = requireVendorContractAdapter(contractProfile);
    if (
      !provider.document.adapter_keys.includes(adapterKey) ||
      !channel.document.adapter_keys.includes(adapterKey)
    ) {
      throw new ConflictException(
        `selected Channel does not support vendor contract adapter ${adapterKey}`,
      );
    }
    const base = effectiveBaseUrl(channel, provider);
    if (!base) throw new ConflictException('selected Channel has no effective base_url');
    return { base, providerSlug: provider.document.slug };
  }

  private requireVendorChannelOwnership(providerResourceUid: string, channelResourceUid: string) {
    const provider = this.registry.getProvider(providerResourceUid);
    if (!provider || !isCatalogCurrentLifecycle(provider.document.lifecycle)) {
      throw new NotFoundException(`Provider ${providerResourceUid} not found`);
    }
    const channel = this.registry.getChannel(channelResourceUid);
    if (
      !channel ||
      channel.document.provider_uid !== providerResourceUid ||
      !isCatalogCurrentLifecycle(channel.document.lifecycle)
    ) {
      throw new NotFoundException(`Channel ${channelResourceUid} not found for Provider`);
    }
    return { provider, channel };
  }

  private async fetchModelIds(
    base: string,
    apiKey: string,
    maxIdLength: number,
  ): Promise<{ ok: true; ids: string[]; ignoredOversized: number } | { ok: false; note: string }> {
    const url = `${base.replace(/\/$/, '')}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await guardedFetch(url, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, note: `拉取失败(${response.status})` };
      const body = await readVendorModelResponse(response);
      const values = Array.isArray(body.data) ? body.data : [];
      let ignoredOversized = 0;
      const ids = [
        ...new Set(
          values.flatMap((model) => {
            const id =
              typeof model === 'object' && model && 'id' in model ? String(model.id).trim() : '';
            if (!id) return [];
            if (id.length > maxIdLength) {
              ignoredOversized += 1;
              return [];
            }
            return [id];
          }),
        ),
      ].slice(0, MAX_VENDOR_MODELS);
      return { ok: true, ids, ignoredOversized };
    } catch (error) {
      return { ok: false, note: redactSecretText((error as Error).message) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function ignoredModelNote(count: number): string | undefined {
  return count > 0 ? `已忽略 ${count} 个超过本项目模型标识长度限制的厂商模型` : undefined;
}

function credentialTypeFor(
  authMethod: string,
  payload: Record<string, string>,
): ModelCredential['credential_type'] {
  if (authMethod === 'api_key') {
    assertCredentialContract(authMethod, 'api_key', payload);
    return 'api_key';
  }
  if (authMethod === 'cli_login') {
    assertCredentialContract(authMethod, 'cli_session', payload);
    return 'cli_session';
  }
  assertCredentialContract(authMethod, '', payload);
  throw new Error('unreachable credential contract');
}

async function readVendorModelResponse(response: Response): Promise<{ data?: unknown[] }> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_VENDOR_RESPONSE_BYTES) {
    throw new Error('厂商模型列表响应过大');
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_VENDOR_RESPONSE_BYTES) {
      throw new Error('厂商模型列表响应过大');
    }
    return parseVendorModelResponse(text);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_VENDOR_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('厂商模型列表响应过大');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseVendorModelResponse(new TextDecoder().decode(bytes));
}

function parseVendorModelResponse(text: string): { data?: unknown[] } {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('厂商模型列表响应格式无效');
  }
  const data = 'data' in parsed ? (parsed as { data?: unknown }).data : undefined;
  if (data !== undefined && !Array.isArray(data)) {
    throw new Error('厂商模型列表 data 必须是数组');
  }
  return { data };
}

function effectiveBaseUrl(
  channel: NonNullable<ReturnType<RegistryService['getChannel']>>,
  provider: NonNullable<ReturnType<RegistryService['getProvider']>>,
): string | null {
  return (
    stringValue(channel.config_overrides.base_url) ??
    channel.document.base_url ??
    stringValue(provider.config_overrides.base_url) ??
    provider.document.base_url ??
    null
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
