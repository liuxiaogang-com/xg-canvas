import { Body, Controller, Post } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { ScriptActionDto } from './dto/script.dto';
import { ScriptService } from './script.service';

// Every script action edits a project's canvas nodes (prompt/params) -> same cap.
@RequirePerm('project.canvas.node.edit', { scope: 'project', from: 'body', key: 'project_id' })
@Controller('script')
export class ScriptController {
  constructor(private readonly script: ScriptService) {}

  @Post('optimize')
  optimize(@CurrentUser() u: AuthUser, @Body() dto: ScriptActionDto) {
    return this.script.optimize({ ...dto, user_id: u.user_id, workspace_id: u.workspace_id });
  }

  @Post('extract-characters')
  characters(@CurrentUser() u: AuthUser, @Body() dto: ScriptActionDto) {
    return this.script.extractCharacters({ ...dto, user_id: u.user_id, workspace_id: u.workspace_id });
  }

  @Post('extract-scenes')
  scenes(@CurrentUser() u: AuthUser, @Body() dto: ScriptActionDto) {
    return this.script.extractScenes({ ...dto, user_id: u.user_id, workspace_id: u.workspace_id });
  }

  @Post('extract-props')
  props(@CurrentUser() u: AuthUser, @Body() dto: ScriptActionDto) {
    return this.script.extractProps({ ...dto, user_id: u.user_id, workspace_id: u.workspace_id });
  }

  @Post('generate-storyboard')
  storyboard(@CurrentUser() u: AuthUser, @Body() dto: ScriptActionDto) {
    return this.script.generateStoryboard({ ...dto, user_id: u.user_id, workspace_id: u.workspace_id });
  }
}
