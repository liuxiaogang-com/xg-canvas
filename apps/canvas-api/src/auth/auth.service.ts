import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User, Workspace, WorkspaceMember } from '../database/entities';
import { IdentityService } from '../identity/identity.service';
import { SessionService } from '../session/session.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface AuthResult {
  token: string;
  user: { id: string; email: string; display_name: string; avatar_url: string | null };
  workspace_id: string;
}

/** Per-request signals the session is stamped with (device + provenance). */
export interface LoginContext {
  userAgent?: string | null;
  ip?: string | null;
  clientDeviceId?: string | null;
  deviceLabel?: string | null;
  platform?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly members: Repository<WorkspaceMember>,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
  ) {}

  async register(dto: RegisterDto, ctx: LoginContext = {}): Promise<AuthResult> {
    const userId = await this.identity.registerWithPassword(dto.email, dto.password, dto.display_name);
    return this.issueForUserId(userId, ctx, 'password');
  }

  async login(dto: LoginDto, ctx: LoginContext = {}): Promise<AuthResult> {
    const userId = await this.identity.verifyPassword(dto.email, dto.password);
    if (!userId) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'invalid credentials' });
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({ code: 'FORBIDDEN', message: 'account disabled' });
    }
    user.last_login_at = new Date();
    await this.users.save(user);
    return this.issueForUser(user, ctx, 'password');
  }

  /** Issue a session for an already-resolved user (shared by all login paths). */
  async issueForUserId(userId: string, ctx: LoginContext, createdVia: string): Promise<AuthResult> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'NOT_FOUND', message: 'user missing' });
    if (user.status !== 'active' || user.merged_into_user_id) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'account disabled' });
    }
    return this.issueForUser(user, ctx, createdVia);
  }

  async findWorkspaceForUser(userId: string): Promise<Workspace> {
    const m = await this.members.findOne({ where: { user_id: userId }, order: { joined_at: 'ASC' } });
    if (!m) throw new UnauthorizedException({ code: 'FORBIDDEN', message: 'no workspace membership' });
    const ws = await this.workspaces.findOne({ where: { id: m.workspace_id } });
    if (!ws) throw new UnauthorizedException({ code: 'NOT_FOUND', message: 'workspace missing' });
    return ws;
  }

  private async issueForUser(user: User, ctx: LoginContext, createdVia: string): Promise<AuthResult> {
    const email = await this.identity.emailForUser(user.id);
    const ws = await this.findWorkspaceForUser(user.id);
    const { token } = await this.sessions.issue({
      user: { id: user.id, email },
      workspaceId: ws.id,
      createdVia,
      clientDeviceId: ctx.clientDeviceId ?? null,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
      deviceLabel: ctx.deviceLabel ?? null,
      platform: ctx.platform ?? null,
    });
    return {
      token,
      workspace_id: ws.id,
      user: {
        id: user.id,
        email: email ?? '',
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    };
  }
}
