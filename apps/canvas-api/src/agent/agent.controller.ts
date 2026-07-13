import { Body, Controller, Post } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { AgentService } from './agent.service';
import { AgentMessageDto } from './dto/agent-message.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('messages')
  message(@CurrentUser() user: AuthUser, @Body() dto: AgentMessageDto) {
    return this.agent.runTurn(user.user_id, user.workspace_id, dto);
  }
}
