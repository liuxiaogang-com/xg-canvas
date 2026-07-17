import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CatalogOrigin, ProviderAuthMethod, TaskType } from '@xgcanvas/shared-types';
import { IsNull, type Repository } from 'typeorm';
import { RegistryService } from '../registry';
import { ModelCredential } from './credential.entity';
import { presentCredential } from './credential.presenter';
import type { CredentialView } from './credential.service';

export interface CredentialCatalogProviderView {
  resource_uid: string;
  slug: string;
  display_name: string;
  auth_method: ProviderAuthMethod;
  adapter_keys: string[];
}

export interface CredentialCatalogChannelView {
  resource_uid: string;
  provider_resource_uid: string;
  slug: string;
  display_name: string;
  adapter_keys: string[];
  enabled: boolean;
}

export interface CredentialCatalogModelView {
  resource_uid: string;
  provider_resource_uid: string;
  model_id: string;
  provider_model_id: string;
  display_name: string;
  task_types: TaskType[];
  adapter_key: string;
  allowed_channel_resource_uids: string[];
  enabled: boolean;
  origin: CatalogOrigin;
}

export interface CredentialCatalogView {
  catalog_epoch: string;
  providers: CredentialCatalogProviderView[];
  channels: CredentialCatalogChannelView[];
  models: CredentialCatalogModelView[];
  credentials: CredentialView[];
}

@Injectable()
export class CredentialCatalogService {
  constructor(
    @InjectRepository(ModelCredential)
    private readonly credentialRepo: Repository<ModelCredential>,
    private readonly registry: RegistryService,
  ) {}

  async getView(): Promise<CredentialCatalogView> {
    if (!this.registry.isReady()) {
      throw new ServiceUnavailableException('model registry is not ready');
    }
    const snapshot = this.registry.getSnapshot();
    const credentials = await this.credentialRepo.find({
      where: { archived_at: IsNull() },
      order: { created_at: 'DESC' },
    });
    return {
      catalog_epoch: snapshot.catalog_epoch,
      providers: [...snapshot.providersByResourceUid.values()]
        .map((provider) => ({
          resource_uid: provider.document.resource_uid,
          slug: provider.document.slug,
          display_name: provider.document.display_name,
          auth_method: provider.document.auth_method,
          adapter_keys: [...provider.document.adapter_keys],
        }))
        .sort(byDisplayName),
      channels: [...snapshot.channelsByResourceUid.values()]
        .map((channel) => ({
          resource_uid: channel.document.resource_uid,
          provider_resource_uid: channel.document.provider_uid,
          slug: channel.document.slug,
          display_name: channel.document.display_name,
          adapter_keys: [...channel.document.adapter_keys],
          enabled: channel.enabled,
        }))
        .sort(byDisplayName),
      models: [...snapshot.byId.values()]
        .map((model) => ({
          resource_uid: model.document.resource_uid,
          provider_resource_uid: model.document.provider_uid,
          model_id: model.document.model_id,
          provider_model_id: model.document.provider_model_id,
          display_name: model.document.display_name,
          task_types: [...model.document.task_types],
          adapter_key: model.document.adapter_key,
          allowed_channel_resource_uids: [...model.document.allowed_channel_uids],
          enabled: model.manifest.enabled === true,
          origin: { ...model.origin },
        }))
        .sort(byDisplayName),
      credentials: credentials.map(presentCredential),
    };
  }
}

function byDisplayName<T extends { display_name: string }>(left: T, right: T): number {
  return left.display_name.localeCompare(right.display_name);
}
