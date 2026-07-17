import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { redactSecretText } from '@xgcanvas/model-catalog';
import { Repository } from 'typeorm';

import { AccountInvokeClient } from '../account-client';
import { Conversation, Message } from '../database/entities';
import type { SendMessageDto } from './dto/send-message.dto';

/** SSE events streamed to the browser for one chat turn. */
export type ChatStreamEvent =
  | { type: 'meta'; conversation_id: string }
  | { type: 'delta'; text?: string; reasoning?: string }
  | {
      type: 'done';
      message_id: string;
      usage: Record<string, unknown> | null;
      latency_ms: number;
      request_id?: string;
    }
  | { type: 'error'; message: string; request_id?: string };

/**
 * Chat lane — conversation persistence + a turn through the real invoke path,
 * available both synchronously (send) and as a token stream (sendStream).
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation) private readonly convs: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgs: Repository<Message>,
    private readonly invoke: AccountInvokeClient,
  ) {}

  listConversations(ownerId: string): Promise<Conversation[]> {
    return this.convs.find({
      where: { owner_id: ownerId },
      order: { updated_at: 'DESC' },
      take: 100,
    });
  }

  async getConversation(id: string, ownerId: string): Promise<Conversation> {
    const conv = await this.convs.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('conversation not found');
    if (conv.owner_id !== ownerId) throw new ForbiddenException();
    return conv;
  }

  async getMessages(conversationId: string, ownerId: string): Promise<Message[]> {
    await this.getConversation(conversationId, ownerId);
    return this.msgs.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
    });
  }

  async deleteConversation(id: string, ownerId: string): Promise<void> {
    const conv = await this.getConversation(id, ownerId);
    await this.convs.remove(conv);
  }

  /** One chat turn: persist the user message, call the model, persist the reply. */
  async send(
    ownerId: string,
    workspaceId: string,
    dto: SendMessageDto,
  ): Promise<{ conversation_id: string; message: Message }> {
    const conv = await this.resolveConversation(ownerId, workspaceId, dto);

    await this.msgs.save(
      this.msgs.create({ conversation_id: conv.id, role: 'user', content: dto.message }),
    );
    const messages = this.buildMessages(conv, await this.loadHistory(conv.id));

    const startedAt = Date.now();
    let assistant: Message;
    try {
      const res = await this.invoke.invoke({
        task_id: `chat-${conv.id}-${startedAt}`,
        task_type: 'gen.text',
        model_id: conv.model_id ?? dto.model_id,
        workspace_id: workspaceId,
        owner_id: ownerId,
        params: {
          prompt: dto.message,
          temperature: dto.temperature ?? 0.7,
          max_tokens: dto.max_tokens ?? 2000,
        },
        inputs: { messages },
        resolution: { kind: 'current' },
      });
      assistant = this.msgs.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: res.text ?? '',
        usage: (res.usage as Record<string, unknown> | undefined) ?? null,
        latency_ms: Date.now() - startedAt,
      });
    } catch (e) {
      const err = e as { message?: string; request_id?: string };
      assistant = this.msgs.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: `[生成失败] ${redactSecretText(err.message ?? '未知错误')}`,
        request_id: err.request_id ?? null,
        latency_ms: Date.now() - startedAt,
      });
    }
    assistant = await this.msgs.save(assistant);

    conv.updated_at = new Date();
    await this.convs.save(conv);
    return { conversation_id: conv.id, message: assistant };
  }

  /**
   * Streaming turn — yields SSE events as tokens arrive, then persists the full
   * assistant message (content + reasoning + usage) once the stream completes.
   */
  async *sendStream(
    ownerId: string,
    workspaceId: string,
    dto: SendMessageDto,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const conv = await this.resolveConversation(ownerId, workspaceId, dto);
    await this.msgs.save(
      this.msgs.create({ conversation_id: conv.id, role: 'user', content: dto.message }),
    );
    const messages = this.buildMessages(conv, await this.loadHistory(conv.id));
    yield { type: 'meta', conversation_id: conv.id };

    const startedAt = Date.now();
    let text = '';
    let reasoning = '';
    let usage: Record<string, unknown> | null = null;
    let requestId: string | undefined;
    let errored: string | undefined;

    for await (const ev of this.invoke.stream(
      {
        task_id: `chat-${conv.id}-${startedAt}`,
        task_type: 'gen.text',
        model_id: conv.model_id ?? dto.model_id,
        workspace_id: workspaceId,
        owner_id: ownerId,
        params: {
          prompt: dto.message,
          temperature: dto.temperature ?? 0.7,
          max_tokens: dto.max_tokens ?? 2000,
        },
        inputs: { messages },
        resolution: { kind: 'current' },
      },
      signal,
    )) {
      if (ev.type === 'meta') requestId = ev.request_id;
      else if (ev.type === 'delta') {
        if (ev.text) text += ev.text;
        if (ev.reasoning) reasoning += ev.reasoning;
        yield { type: 'delta', text: ev.text, reasoning: ev.reasoning };
      } else if (ev.type === 'done') {
        usage = (ev.response.usage as Record<string, unknown> | undefined) ?? null;
        requestId = ev.request_id;
      } else if (ev.type === 'error') {
        errored = ev.message;
        requestId = ev.request_id;
      }
    }

    const assistant = await this.msgs.save(
      this.msgs.create({
        conversation_id: conv.id,
        role: 'assistant',
        content: errored ? `[生成失败] ${errored}` : text,
        reasoning: reasoning || null,
        usage: (usage ?? undefined) as never,
        request_id: requestId ?? null,
        latency_ms: Date.now() - startedAt,
      }),
    );
    conv.updated_at = new Date();
    await this.convs.save(conv);

    if (errored) yield { type: 'error', message: errored, request_id: requestId };
    else
      yield {
        type: 'done',
        message_id: assistant.id,
        usage,
        latency_ms: Date.now() - startedAt,
        request_id: requestId,
      };
  }

  /** History = content only (never resend reasoning_content to the model). */
  private buildMessages(
    conv: Conversation,
    history: Message[],
  ): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];
    if (conv.system_prompt) messages.push({ role: 'system', content: conv.system_prompt });
    for (const m of history) {
      if (m.role === 'user' || m.role === 'assistant')
        messages.push({ role: m.role, content: m.content });
    }
    return messages;
  }

  private loadHistory(conversationId: string): Promise<Message[]> {
    return this.msgs.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
    });
  }

  private async resolveConversation(
    ownerId: string,
    workspaceId: string,
    dto: SendMessageDto,
  ): Promise<Conversation> {
    if (dto.conversation_id) {
      const conv = await this.getConversation(dto.conversation_id, ownerId);
      if (dto.model_id) conv.model_id = dto.model_id;
      if (dto.system_prompt !== undefined) conv.system_prompt = dto.system_prompt;
      return conv;
    }
    return this.convs.save(
      this.convs.create({
        owner_id: ownerId,
        workspace_id: workspaceId,
        model_id: dto.model_id,
        system_prompt: dto.system_prompt ?? null,
        title: dto.message.trim().slice(0, 30) || '新对话',
        params: { temperature: dto.temperature ?? 0.7 },
      }),
    );
  }
}
