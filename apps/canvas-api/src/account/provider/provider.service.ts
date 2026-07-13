import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelProvider } from './provider.entity';
import { CreateProviderDto } from './create-provider.dto';
import { UpdateProviderDto } from './update-provider.dto';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(ModelProvider)
    private readonly providerRepo: Repository<ModelProvider>,
  ) {}

  async create(dto: CreateProviderDto): Promise<ModelProvider> {
    const existing = await this.providerRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Provider with slug "${dto.slug}" already exists`);
    }
    const provider = this.providerRepo.create(dto);
    return this.providerRepo.save(provider);
  }

  async findAll(): Promise<ModelProvider[]> {
    return this.providerRepo.find({ order: { sort_order: 'ASC', display_name: 'ASC' } });
  }

  async findOne(id: string): Promise<ModelProvider> {
    const provider = await this.providerRepo.findOne({
      where: { id },
      relations: ['channels', 'models'],
    });
    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }
    return provider;
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ModelProvider> {
    const provider = await this.findOne(id);
    Object.assign(provider, dto);
    return this.providerRepo.save(provider);
  }

  async remove(id: string): Promise<void> {
    const provider = await this.findOne(id);
    await this.providerRepo.remove(provider);
  }
}
