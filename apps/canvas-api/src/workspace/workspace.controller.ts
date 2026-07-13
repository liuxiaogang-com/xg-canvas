import { Controller, Get } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { WorkspaceService } from './workspace.service';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.user_id);
  }
}
