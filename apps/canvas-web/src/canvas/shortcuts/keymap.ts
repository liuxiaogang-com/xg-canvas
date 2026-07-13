/* Canvas keyboard-shortcut registry. New actions just add a row here — the
 * settings panel and the dispatcher pick them up automatically. */

export type ShortcutId =
  | 'create.image'
  | 'create.video'
  | 'create.audio'
  | 'create.text'
  | 'create.script'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.duplicate'
  | 'edit.delete'
  | 'edit.group'
  | 'edit.ungroup'
  | 'view.save'
  | 'view.find';

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  category: '创建' | '编辑' | '视图';
  defaultKeys: string;
  /** intercept browser default (Ctrl+S/F) and fire even inside inputs. */
  intercept?: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'create.image', label: '创建图片节点', category: '创建', defaultKeys: 'i' },
  { id: 'create.video', label: '创建视频节点', category: '创建', defaultKeys: 'v' },
  { id: 'create.audio', label: '创建音频节点', category: '创建', defaultKeys: 'a' },
  { id: 'create.text', label: '创建文本节点', category: '创建', defaultKeys: 't' },
  { id: 'create.script', label: '创建脚本节点', category: '创建', defaultKeys: 's' },
  { id: 'edit.undo', label: '撤销', category: '编辑', defaultKeys: 'ctrl+z' },
  { id: 'edit.redo', label: '重做', category: '编辑', defaultKeys: 'ctrl+shift+z' },
  { id: 'edit.copy', label: '复制', category: '编辑', defaultKeys: 'ctrl+c' },
  { id: 'edit.paste', label: '粘贴', category: '编辑', defaultKeys: 'ctrl+v' },
  { id: 'edit.duplicate', label: '创建副本', category: '编辑', defaultKeys: 'ctrl+d' },
  { id: 'edit.delete', label: '删除选中', category: '编辑', defaultKeys: 'delete' },
  { id: 'edit.group', label: '打组', category: '编辑', defaultKeys: 'ctrl+g' },
  { id: 'edit.ungroup', label: '拆组', category: '编辑', defaultKeys: 'ctrl+shift+g' },
  { id: 'view.save', label: '保存快照', category: '视图', defaultKeys: 'ctrl+s', intercept: true },
  { id: 'view.find', label: '资源库', category: '视图', defaultKeys: 'ctrl+f', intercept: true },
];

/** node type created by each create.* shortcut. */
export const CREATE_NODE_TYPE: Partial<Record<ShortcutId, string>> = {
  'create.image': 'gen_image',
  'create.video': 'gen_video',
  'create.audio': 'gen_audio',
  'create.text': 'gen_text',
  'create.script': 'script_input',
};

/** Normalize a KeyboardEvent to a combo string like "ctrl+shift+z" / "v" / "delete". */
export function comboFromEvent(e: KeyboardEvent): string {
  let key = e.key.toLowerCase();
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';
  if (key === 'backspace') key = 'delete';
  if (key === ' ') key = 'space';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(key);
  return parts.join('+');
}

/** Human-readable combo for the UI (Ctrl+Shift+Z, V, Del). */
export function comboLabel(combo: string): string {
  if (!combo) return '—';
  return combo
    .split('+')
    .map((p) => (p === 'ctrl' ? 'Ctrl' : p === 'shift' ? 'Shift' : p === 'alt' ? 'Alt' : p === 'delete' ? 'Del' : p === 'space' ? 'Space' : p.toUpperCase()))
    .join(' + ');
}

export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}
