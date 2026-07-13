import { Injectable, Logger } from '@nestjs/common';

import type { ProducedAsset } from '../account-client';
import { DEMO_AUDIO_STORAGE, DEMO_IMAGE_STORAGE, DEMO_VIDEO_STORAGE } from './demo-assets';
import { type ClaimedTask, TaskService } from './task.service';
import { TaskTerminalService } from './task-terminal.service';

const DEMO_TEXT =
  '在 AI 创意工作流中，灵感与技术的交汇往往能碰撞出最精彩的创意。' +
  '从文字描述到视觉呈现，从草稿概念到精细成品，每一步都凝聚着算法与人类审美的共鸣。' +
  '本次品牌广告以"自然之美"为核心，通过柔光摄影与细腻色调传递高端护肤品的奢华质感。';

const DEMO_TRANSCRIPTION =
  '大家好，欢迎来到 XG Canvas 创意工作台。今天我将为大家演示如何使用 AI 辅助创意工作流，' +
  '将灵感快速转化为视觉方案，再通过迭代打磨成最终作品。整个过程只需几分钟。';

const DEMO_SCRIPT_OPTIMIZE =
  '【优化后剧本】\n第一幕：清晨，城市天际线。旁白引入主题——"每一天都值得被记录"。\n' +
  '第二幕：主角走进工作室，打开画布，灵感涌现。\n第三幕：成品展示，品牌 LOGO 渐入。';

const DEMO_STORYBOARD =
  '| # | 画面描述 | 镜头 | 时长 |\n|---|---------|------|------|\n' +
  '| 1 | 远景：城市日出 | 固定 | 3s |\n| 2 | 中景：主角入场 | 推进 | 2s |\n' +
  '| 3 | 特写：产品展示 | 慢摇 | 4s |';

function randomDelay(signal?: AbortSignal): Promise<void> {
  const ms = 1000 + Math.random() * 1000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });
}

@Injectable()
export class MockExecutorService {
  private readonly logger = new Logger(MockExecutorService.name);

  constructor(
    private readonly tasks: TaskService,
    private readonly terminal: TaskTerminalService,
  ) {}

  /** Run a task with mock results -- same signature as TaskExecutorService. */
  async run(claimed: ClaimedTask, signal?: AbortSignal): Promise<void> {
    const t = await this.tasks.startClaimed(claimed);
    if (!t) return;

    try {
      await randomDelay(signal);
      await this.dispatch(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`mock task ${t.id} failed: ${msg}`);
      await this.terminal.fail(t.id, t.lease_token, 'MOCK_ERROR', msg);
    }
  }

  private async dispatch(t: ClaimedTask): Promise<void> {
    switch (t.type) {
      case 'gen.text':
        return this.succeedText(t, DEMO_TEXT);
      case 'gen.image':
        return this.succeedAsset(t, { asset_type: 'image', storage: DEMO_IMAGE_STORAGE });
      case 'gen.video':
        return this.succeedAsset(t, { asset_type: 'video', storage: DEMO_VIDEO_STORAGE });
      case 'gen.audio':
        return this.succeedAsset(t, { asset_type: 'audio', storage: DEMO_AUDIO_STORAGE });
      case 'audio.transcribe':
        return this.succeedText(t, DEMO_TRANSCRIPTION);
      case 'script.optimize':
        return this.succeedText(t, DEMO_SCRIPT_OPTIMIZE);
      case 'script.extract_characters':
        return this.succeedText(t, '角色A — 主角，年轻设计师，充满创意热情\n角色B — 导师，资深艺术总监，经验丰富');
      case 'script.extract_scenes':
        return this.succeedText(t, '场景1：设计工作室内景，晨光透窗\n场景2：城市街道外景，霓虹闪烁');
      case 'script.extract_props':
        return this.succeedText(t, '道具：数位板、触控笔、投影仪、品牌样品');
      case 'script.generate_storyboard':
        return this.succeedText(t, DEMO_STORYBOARD);
      default:
        return this.succeedText(t, `Mock result for ${t.type}`);
    }
  }

  private async succeedText(t: ClaimedTask, text: string): Promise<void> {
    await this.terminal.succeed(t.id, t.lease_token, { assets: [], text });
    this.logger.debug(`mock task ${t.id} (${t.type}) -> succeeded [text]`);
  }

  private async succeedAsset(t: ClaimedTask, produced: ProducedAsset): Promise<void> {
    await this.terminal.succeed(t.id, t.lease_token, { assets: [produced] });
    this.logger.debug(`mock task ${t.id} (${t.type}) -> succeeded [asset]`);
  }
}
