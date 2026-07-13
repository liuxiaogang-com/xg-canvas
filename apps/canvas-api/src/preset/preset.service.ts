import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { PromptPreset } from '../database/entities';
import type { CreatePresetDto, UpdatePresetDto } from './dto/preset.dto';

@Injectable()
export class PresetService {
  constructor(@InjectRepository(PromptPreset) private readonly presets: Repository<PromptPreset>) {}

  /** Returns system presets + the user's own presets, system first then sort_order. */
  async listForUser(userId: string, taskType?: string): Promise<PromptPreset[]> {
    const qb = this.presets
      .createQueryBuilder('p')
      .where('p.enabled = true')
      .andWhere(
        new Brackets((b) =>
          b.where('p.scope = :sys', { sys: 'system' }).orWhere('p.owner_id = :uid', { uid: userId }),
        ),
      )
      .orderBy('p.scope', 'DESC') // 'system' < 'user' alphabetically; DESC -> user first? we want system first
      .addOrderBy('p.sort_order', 'ASC')
      .addOrderBy('p.created_at', 'DESC');
    if (taskType) qb.andWhere('p.task_type = :tt', { tt: taskType });
    const rows = await qb.getMany();
    // Sort system first explicitly so callers don't depend on collation.
    return rows.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'system' ? -1 : 1));
  }

  async create(userId: string, dto: CreatePresetDto): Promise<PromptPreset> {
    const p = this.presets.create({
      scope: 'user',
      owner_id: userId,
      task_type: dto.task_type,
      title: dto.title,
      content: dto.content,
      tags: dto.tags ?? [],
    });
    return this.presets.save(p);
  }

  async update(userId: string, id: string, dto: UpdatePresetDto): Promise<PromptPreset> {
    const p = await this.presets.findOne({ where: { id } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'preset not found' });
    if (p.scope !== 'user' || p.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot edit this preset' });
    }
    Object.assign(p, dto);
    return this.presets.save(p);
  }

  async remove(userId: string, id: string): Promise<void> {
    const p = await this.presets.findOne({ where: { id } });
    if (!p) return;
    if (p.scope !== 'user' || p.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot delete this preset' });
    }
    await this.presets.remove(p);
  }
}
