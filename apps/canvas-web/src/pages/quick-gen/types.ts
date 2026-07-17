import type { GenerationReference, PromptDocument, TaskType } from '@xgcanvas/shared-types';
import type { RichModelSummary } from '../../api/model';

export type GenMode = 'image' | 'video' | 'text' | 'audio';

export const TASK_TYPE_BY_MODE: Record<GenMode, TaskType> = {
  image: 'gen.image',
  video: 'gen.video',
  text: 'gen.text',
  audio: 'gen.audio',
};

export interface CommandBarState {
  mode: GenMode;
  modelId: string | null;
  selectedModel: RichModelSummary | null;
  inputMode: string | null;
  prompt: string;
  promptDoc?: PromptDocument;
  references: GenerationReference[];
  params: Record<string, unknown>;
}
