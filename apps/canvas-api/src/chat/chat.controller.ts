import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { redactSecretText } from '@xgcanvas/model-catalog';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.chat.listConversations(user.user_id);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.getMessages(id, user.user_id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.deleteConversation(id, user.user_id);
  }

  @Post('messages')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chat.send(user.user_id, user.workspace_id, dto);
  }

  /**
   * Streaming turn — Server-Sent Events. Each frame is `data: <json>\n\n` where the
   * json is a ChatStreamEvent; the stream ends with `data: [DONE]`. POST (not the
   * EventSource GET) so the message + params travel in the body; the browser reads it
   * with a fetch ReadableStream.
   */
  @Post('stream')
  async stream(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
    res.flushHeaders?.();
    // Abort the vendor stream when the browser disconnects so we stop spending tokens
    // on a response no one is reading. The signal threads down to the adapter's fetch.
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    try {
      for await (const ev of this.chat.sendStream(user.user_id, user.workspace_id, dto, ac.signal)) {
        if (ac.signal.aborted) break;
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (e) {
      const err = e as { message?: string };
      if (!ac.signal.aborted) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: redactSecretText(err.message ?? '流式生成失败'),
          })}\n\n`,
        );
      }
    } finally {
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  }
}
