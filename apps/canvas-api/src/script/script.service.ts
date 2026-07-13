import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

import { CanvasService } from '../canvas/canvas.service';
import { CanvasMutatorService, type BatchOp } from '../canvas/canvas-mutator.service';
import { ProjectService } from '../project/project.service';
import { LlmExtractService } from './llm-extract.service';
import {
  EXTRACT_CHARACTERS_PROMPT,
  EXTRACT_PROPS_PROMPT,
  EXTRACT_SCENES_PROMPT,
  GENERATE_STORYBOARD_PROMPT,
  OPTIMIZE_SCRIPT_PROMPT,
} from './prompts';

interface BaseInput {
  user_id: string;
  workspace_id: string;
  project_id: string;
  script_node_id: string;
  raw_text: string;
  model_id?: string;
}

interface ExtractedCharacters {
  characters: { name: string; description?: string; traits?: string[] }[];
}
interface ExtractedScenes {
  scenes: { name: string; description?: string; time_of_day?: string }[];
}
interface ExtractedProps {
  props: { name: string; description?: string }[];
}
interface ExtractedStoryboard {
  shots: {
    shot_no: number;
    summary: string;
    dialogue?: string;
    prompt: string;
    duration_sec: number;
    characters?: string[];
    scene?: string;
    props?: string[];
  }[];
}

const BASE_X = 280;
const BASE_Y_PER_ROW = 240;

@Injectable()
export class ScriptService {
  private readonly logger = new Logger(ScriptService.name);

  constructor(
    private readonly llm: LlmExtractService,
    private readonly canvases: CanvasService,
    private readonly mutator: CanvasMutatorService,
    private readonly projects: ProjectService,
  ) {}

  async optimize(input: BaseInput): Promise<{ optimized_text: string }> {
    await this.projects.getOrThrow(input.user_id, input.project_id);
    return this.llm.extract<{ optimized_text: string }>({
      workspace_id: input.workspace_id,
      task_id: `script-optimize-${randomUUID()}`,
      system: OPTIMIZE_SCRIPT_PROMPT,
      user: input.raw_text,
      model_id: input.model_id,
    });
  }

  async extractCharacters(input: BaseInput): Promise<{ created_node_ids: string[] }> {
    const r = await this.runExtract<ExtractedCharacters>(input, EXTRACT_CHARACTERS_PROMPT, 'characters');
    return r;
  }

  async extractScenes(input: BaseInput): Promise<{ created_node_ids: string[] }> {
    const r = await this.runExtract<ExtractedScenes>(input, EXTRACT_SCENES_PROMPT, 'scenes');
    return r;
  }

  async extractProps(input: BaseInput): Promise<{ created_node_ids: string[] }> {
    const r = await this.runExtract<ExtractedProps>(input, EXTRACT_PROPS_PROMPT, 'props');
    return r;
  }

  /**
   * Pulls characters/scenes already on the canvas (by name), then asks the
   * LLM to generate shots referencing those names. The mutator then both
   * creates the storyboard nodes AND wires entity_ref edges by name lookup.
   */
  async generateStoryboard(input: BaseInput): Promise<{ created_node_ids: string[] }> {
    const c = await this.canvases.getOrCreate(input.user_id, input.project_id);
    const payload = await this.canvases.fullPayload(input.user_id, input.project_id);
    const knownByType = (kind: 'character' | 'scene' | 'prop') =>
      payload.nodes
        .filter((n) => n.type === `entity_${kind}`)
        .map((n) => ({ id: n.id, name: (n.data as { name?: string }).name ?? '' }))
        .filter((x) => x.name);
    const characters = knownByType('character');
    const scenes = knownByType('scene');
    const props = knownByType('prop');
    const userMsg = [
      `已有角色: ${characters.map((c) => c.name).join('、') || '(无)'}`,
      `已有场景: ${scenes.map((s) => s.name).join('、') || '(无)'}`,
      `已有物品: ${props.map((p) => p.name).join('、') || '(无)'}`,
      '剧本:',
      input.raw_text,
    ].join('\n');

    const extracted = await this.llm.extract<ExtractedStoryboard>({
      workspace_id: input.workspace_id,
      task_id: `script-storyboard-${randomUUID()}`,
      system: GENERATE_STORYBOARD_PROMPT,
      user: userMsg,
      model_id: input.model_id,
    });

    const ops: BatchOp[] = [];
    const findId = (list: { id: string; name: string }[], name?: string) =>
      list.find((x) => x.name === name)?.id;
    extracted.shots.forEach((shot, i) => {
      const cid = `shot-${shot.shot_no}`;
      ops.push({
        kind: 'create_node',
        client_id: cid,
        type: 'storyboard_shot',
        position: { x: BASE_X + 360, y: 80 + i * BASE_Y_PER_ROW },
        data: {
          shot_no: shot.shot_no,
          summary: shot.summary,
          dialogue: shot.dialogue ?? '',
          prompt: shot.prompt,
          duration_sec: shot.duration_sec,
          target: 'image',
          model_id: null,
        },
      });
      for (const ch of shot.characters ?? []) {
        const fromId = findId(characters, ch);
        if (fromId) ops.push(edgeOp(fromId, 'ref', cid, 'characters', 'entity_ref:character'));
      }
      const scId = findId(scenes, shot.scene);
      if (scId) ops.push(edgeOp(scId, 'ref', cid, 'scene', 'entity_ref:scene'));
      for (const pn of shot.props ?? []) {
        const fromId = findId(props, pn);
        if (fromId) ops.push(edgeOp(fromId, 'ref', cid, 'props', 'entity_ref:prop'));
      }
    });

    const result = await this.mutator.apply(c.id, ops, input.user_id);
    return { created_node_ids: Object.values(result.created_node_ids) };
  }

  private async runExtract<T extends ExtractedCharacters | ExtractedScenes | ExtractedProps>(
    input: BaseInput,
    prompt: string,
    field: 'characters' | 'scenes' | 'props',
  ): Promise<{ created_node_ids: string[] }> {
    const c = await this.canvases.getOrCreate(input.user_id, input.project_id);
    const extracted = await this.llm.extract<T>({
      workspace_id: input.workspace_id,
      task_id: `script-extract-${field}-${randomUUID()}`,
      system: prompt,
      user: input.raw_text,
      model_id: input.model_id,
    });
    const items =
      ((extracted as unknown) as Record<string, { name: string; description?: string }[]>)[field] ?? [];
    const typeMap = {
      characters: 'entity_character',
      scenes: 'entity_scene',
      props: 'entity_prop',
    } as const;
    const ops: BatchOp[] = items.map((it, i) => ({
      kind: 'create_node',
      client_id: `${field}-${i}`,
      type: typeMap[field],
      position: { x: BASE_X + (i % 4) * 280, y: 200 + Math.floor(i / 4) * 240 },
      data: {
        name: it.name,
        description: it.description ?? '',
        ref_asset_ids: [],
      },
    }));
    const result = await this.mutator.apply(c.id, ops, input.user_id);
    return { created_node_ids: Object.values(result.created_node_ids) };
  }
}

function edgeOp(srcRef: string, srcHandle: string, tgtRef: string, tgtHandle: string, dataType: string): BatchOp {
  return {
    kind: 'create_edge',
    source_ref: srcRef,
    source_handle: srcHandle,
    target_ref: tgtRef,
    target_handle: tgtHandle,
    data_type: dataType,
  };
}
