import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelChannel } from './channel.entity';
import { CreateChannelDto } from './create-channel.dto';
import { UpdateChannelDto } from './update-channel.dto';

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(ModelChannel)
    private readonly channelRepo: Repository<ModelChannel>,
  ) {}

  async create(providerId: string, dto: CreateChannelDto): Promise<ModelChannel> {
    const channel = this.channelRepo.create({
      provider_id: providerId,
      ...dto,
    });
    return this.channelRepo.save(channel);
  }

  async findAllByProvider(providerId: string): Promise<ModelChannel[]> {
    return this.channelRepo.find({
      where: { provider_id: providerId },
      order: { priority: 'ASC', display_name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ModelChannel> {
    const channel = await this.channelRepo.findOne({
      where: { id },
      relations: ['provider', 'credentials'],
    });
    if (!channel) {
      throw new NotFoundException(`Channel ${id} not found`);
    }
    return channel;
  }

  async update(id: string, dto: UpdateChannelDto): Promise<ModelChannel> {
    const channel = await this.findOne(id);
    Object.assign(channel, dto);
    return this.channelRepo.save(channel);
  }

  async remove(id: string): Promise<void> {
    const channel = await this.findOne(id);
    await this.channelRepo.remove(channel);
  }
}
