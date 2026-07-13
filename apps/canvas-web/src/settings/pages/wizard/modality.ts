/**
 * Coarse 模态 dimension a task_type belongs to — the "支持的功能" axis of the
 * credential wizard. Derived from the task_type string so new task types fold in
 * automatically (video.* -> 视频, image.* / entity / storyboard -> 图片, ...).
 * The candidate set shown for a provider is the union of the modalities its
 * PRESET models cover, so an all-text provider only offers 文本.
 */
export type Modality = 'text' | 'image' | 'video' | 'audio';

export const MODALITY_LABEL: Record<Modality, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
};

/** Stable display order. */
export const MODALITY_ORDER: Modality[] = ['text', 'image', 'video', 'audio'];

export function modalityOfTaskType(taskType: string): Modality {
  if (taskType.includes('video')) return 'video';
  if (taskType.includes('audio')) return 'audio';
  if (taskType.includes('image') || taskType.startsWith('entity') || taskType.startsWith('storyboard'))
    return 'image';
  return 'text';
}

/** Distinct modalities a set of task_types covers, in display order. */
export function modalitiesOf(taskTypes: string[]): Modality[] {
  const s = new Set<Modality>();
  taskTypes.forEach((t) => s.add(modalityOfTaskType(t)));
  return MODALITY_ORDER.filter((m) => s.has(m));
}
