import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Workspace, WorkspaceMember } from '../database/entities';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly members: Repository<WorkspaceMember>,
  ) {}

  async listForUser(userId: string): Promise<Workspace[]> {
    const memberships = await this.members.find({ where: { user_id: userId } });
    if (memberships.length === 0) return [];
    const ids = memberships.map((m) => m.workspace_id);
    return this.workspaces
      .createQueryBuilder('w')
      .whereInIds(ids)
      .orderBy('w.created_at', 'ASC')
      .getMany();
  }

  async assertMember(userId: string, workspaceId: string): Promise<WorkspaceMember> {
    const m = await this.members.findOne({ where: { user_id: userId, workspace_id: workspaceId } });
    if (!m) throw new NotFoundException({ code: 'FORBIDDEN', message: 'not a member of workspace' });
    return m;
  }
}
