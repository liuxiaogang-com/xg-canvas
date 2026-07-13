import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ModelInputContract } from '@xgcanvas/shared-types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelDefinition } from './model-definition.entity';
import { CreateModelDefinitionDto } from './create-model-definition.dto';
import { UpdateModelDefinitionDto } from './update-model-definition.dto';
import { CredentialService } from '../credential/credential.service';
import { parseOptionalModelInputContract } from './model-input-contract.schema';

@Injectable()
export class ModelDefinitionService {
  constructor(
    @InjectRepository(ModelDefinition)
    private readonly modelRepo: Repository<ModelDefinition>,
    private readonly credentials: CredentialService,
  ) {}

  async create(dto: CreateModelDefinitionDto): Promise<ModelDefinition> {
    const existing = await this.modelRepo.findOne({ where: { model_id: dto.model_id } });
    if (existing) {
      throw new ConflictException(`Model with model_id "${dto.model_id}" already exists`);
    }
    const normalized = this.normalizeInputContract(dto);
    const model = this.modelRepo.create(normalized as Partial<ModelDefinition>);
    return this.modelRepo.save(model);
  }

  /**
   * All models. By default only returns models whose provider has at least one
   * enabled credential. Pass includeAll=true (e.g. from the credential wizard)
   * to show all models regardless of credential status.
   */
  async findAll(includeAll = false): Promise<ModelDefinition[]> {
    const all = await this.modelRepo.find({
      order: { sort_order: 'ASC', display_name: 'ASC' },
      relations: ['provider'],
    });
    if (includeAll) return all;
    const activeProviders = await this.credentials.getProviderSlugsWithCredentials();
    return all.filter((m) => m.provider && activeProviders.has(m.provider.slug));
  }

  async findOne(id: string): Promise<ModelDefinition> {
    const model = await this.modelRepo.findOne({
      where: { id },
      relations: ['provider'],
    });
    if (!model) {
      throw new NotFoundException(`Model definition ${id} not found`);
    }
    return model;
  }

  async update(id: string, dto: UpdateModelDefinitionDto): Promise<ModelDefinition> {
    const model = await this.findOne(id);
    Object.assign(model, this.normalizeInputContract(dto));
    return this.modelRepo.save(model);
  }

  async remove(id: string): Promise<void> {
    const model = await this.findOne(id);
    await this.modelRepo.remove(model);
  }

  private normalizeInputContract<T extends CreateModelDefinitionDto | UpdateModelDefinitionDto>(
    dto: T,
  ): T {
    if (!Object.prototype.hasOwnProperty.call(dto, 'input_contract')) return dto;
    const parsed = parseOptionalModelInputContract(dto.input_contract);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'input_contract is invalid',
        details: { input_contract: parsed.message },
      });
    }
    return {
      ...dto,
      input_contract: parsed.data ?? ({} as ModelInputContract),
    };
  }
}
