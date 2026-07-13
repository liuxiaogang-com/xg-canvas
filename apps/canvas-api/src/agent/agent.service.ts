import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccountInvokeClient } from '../account-client';
import { FeatureConfigService } from '../account/feature-config/feature-config.service';
import type { AgentMessageDto } from './dto/agent-message.dto';

const SYSTEM_PROMPT = `你是 XG Canvas 创意画布上的 Agent 助手。
- 用户会向你描述对当前节点的修改诉求(自然语言)
- 你输出严格遵循以下 JSON 形态的回复，**不要写 Markdown / 解释文字**：
  {
    "explanation": "简短中文说明你做了什么(<=80 字)",
    "patch": {
      "data": {
        "prompt": "改写后的提示词",
        "params": { "<key>": "<value>" }
      }
    },
    "trigger_regenerate": true
  }
- 若用户要求新建节点，再额外加 "create_node": { "type": "...", "data": { ... } }`;

export interface AgentReply {
  session_id: string;
  reply_text: string;
  /** Parsed JSON if the model produced one. */
  patch: {
    explanation?: string;
    patch?: { data?: Record<string, unknown> };
    create_node?: { type: string; data: Record<string, unknown> };
    trigger_regenerate?: boolean;
  } | null;
  raw: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly invoke: AccountInvokeClient,
    private readonly config: ConfigService,
    private readonly featureConfig: FeatureConfigService,
  ) {}

  /**
   * One-shot agent turn — returns the assistant message + parsed patch.
   * Streaming over SSE/WS is the M3 stretch goal (S3.12); the controller
   * already advertises text/event-stream so we can swap in fragments later
   * without a contract break.
   */
  async runTurn(userId: string, workspaceId: string, dto: AgentMessageDto): Promise<AgentReply> {
    const sessionId = dto.session_id ?? randomUUID();
    const modelId =
      dto.model_id ??
      (await this.featureConfig.resolveModel('agent')) ??
      this.config.get<string>('AGENT_DEFAULT_MODEL', 'openai:gpt-4o-mini');

    const system = [SYSTEM_PROMPT];
    if (dto.node_context) {
      system.push(`当前选中节点: type=${dto.node_context.type}, data=${JSON.stringify(dto.node_context.data)}`);
    }

    const messages = [
      { role: 'system' as const, content: system.join('\n') },
      ...(dto.history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: dto.message },
    ];

    const res = await this.invoke.invoke({
      task_id: `agent-${sessionId}-${Date.now()}`,
      task_type: 'gen.text',
      model_id: modelId,
      workspace_id: workspaceId,
      params: { temperature: 0.5, max_tokens: 600, json_mode: true },
      inputs: { messages },
    });

    const text = res.text ?? '';
    return {
      session_id: sessionId,
      reply_text: text,
      raw: text,
      patch: this.tryParse(text),
      usage: res.usage,
    };
  }

  private tryParse(text: string): AgentReply['patch'] {
    if (!text) return null;
    const trimmed = text.trim().replace(/^```(?:json)?/, '').replace(/```$/, '');
    try {
      return JSON.parse(trimmed);
    } catch {
      this.logger.debug(`agent reply not JSON: ${trimmed.slice(0, 120)}`);
      return null;
    }
  }
}
