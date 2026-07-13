import type { GenerationReference, PromptDocument } from '@xgcanvas/shared-types';

export type GenMode = 'image' | 'video' | 'text' | 'audio';

export const TASK_TYPE_BY_MODE: Record<GenMode, string> = {
  image: 'gen.image',
  video: 'gen.video',
  text: 'gen.text',
  audio: 'gen.audio',
};

export interface CommandBarState {
  mode: GenMode;
  modelId: string | null;
  inputMode: string | null;
  prompt: string;
  promptDoc?: PromptDocument;
  references: GenerationReference[];
  params: Record<string, unknown>;
}
