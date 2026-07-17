import { Injectable, Logger } from '@nestjs/common';

import { AccountInvokeClient, AccountModelsClient } from '../account-client';

interface ExtractInput {
  workspace_id: string;
  task_id: string;
  system: string;
  user: string;
  model_id?: string;
}

@Injectable()
export class LlmExtractService {
  private readonly logger = new Logger(LlmExtractService.name);

  constructor(
    private readonly invoke: AccountInvokeClient,
    private readonly models: AccountModelsClient,
  ) {}

  /** Run a JSON-mode LLM call and return the parsed object. */
  async extract<T>(input: ExtractInput): Promise<T> {
    const modelId =
      input.model_id ?? (await this.models.requireFeatureModel('script-extract', 'gen.text'));
    const res = await this.invoke.invoke({
      task_id: input.task_id,
      task_type: 'gen.text',
      model_id: modelId,
      workspace_id: input.workspace_id,
      params: { temperature: 0.2, max_tokens: 1500, json_mode: true },
      inputs: {
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      },
      resolution: { kind: 'current' },
    });
    const text = (res.text ?? '')
      .trim()
      .replace(/^```(?:json)?/, '')
      .replace(/```$/, '');
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      this.logger.warn(`extraction parse failed; raw=${text.slice(0, 200)}`);
      throw new Error(`LLM did not return valid JSON: ${(e as Error).message}`);
    }
  }
}
