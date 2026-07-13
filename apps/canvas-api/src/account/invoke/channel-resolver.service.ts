import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import { ModelChannel } from '../channel/channel.entity';
import { ModelDefinition } from '../model-definition/model-definition.entity';

@Injectable()
export class ChannelResolverService {
  constructor(
    @InjectRepository(ModelChannel) private readonly channels: Repository<ModelChannel>,
    @InjectRepository(ModelDefinition) private readonly models: Repository<ModelDefinition>,
  ) {}

  /**
   * Pick the highest-priority enabled channel for a model.
   * Pin support: if `pinChannelId` is given, that channel must exist and be
   * enabled (admin-side override).
   */
  async select(modelId: string, pinChannelId?: string): Promise<ModelChannel> {
    return (await this.listCandidates(modelId, pinChannelId))[0];
  }

  /**
   * All enabled channels for a model's provider in priority order — the failover
   * candidate list (C3). A pinned channel collapses to a single candidate.
   */
  async listCandidates(modelId: string, pinChannelId?: string): Promise<ModelChannel[]> {
    const model = await this.models.findOne({ where: { model_id: modelId }, relations: ['provider'] });
    if (!model) {
      throw new AdapterError({ code: ERROR_CODES.MODEL_NOT_FOUND, message: `model not found: ${modelId}` });
    }
    if (!model.enabled || !model.provider?.enabled) {
      throw new AdapterError({ code: ERROR_CODES.MODEL_DISABLED, message: `model disabled: ${modelId}` });
    }

    if (pinChannelId) {
      const ch = await this.channels.findOne({ where: { id: pinChannelId, enabled: true } });
      const allowed = model.allowed_channel_ids ?? [];
      if (
        !ch ||
        ch.provider_id !== model.provider_id ||
        (allowed.length > 0 && !allowed.includes(ch.id))
      ) {
        throw new AdapterError({
          code: ERROR_CODES.CHANNEL_UNAVAILABLE,
          message: `pinned channel unavailable: ${pinChannelId}`,
        });
      }
      return [ch];
    }
    const where = model.allowed_channel_ids?.length
      ? { provider_id: model.provider_id, enabled: true, id: In(model.allowed_channel_ids) }
      : { provider_id: model.provider_id, enabled: true };
    const channels = await this.channels.find({
      where,
      order: { priority: 'ASC', weight: 'DESC' },
    });
    if (channels.length === 0) {
      throw new AdapterError({
        code: ERROR_CODES.CHANNEL_UNAVAILABLE,
        message: `no enabled channel for provider of ${modelId}`,
      });
    }
    return channels;
  }

  async getById(id: string): Promise<ModelChannel> {
    const ch = await this.channels.findOne({ where: { id } });
    if (!ch) {
      throw new AdapterError({
        code: ERROR_CODES.CHANNEL_UNAVAILABLE,
        message: `channel not found: ${id}`,
      });
    }
    return ch;
  }
}
