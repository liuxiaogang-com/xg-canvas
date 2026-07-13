import type { JSONContent } from '@tiptap/core';
import type {
  PromptDocument,
  PromptMention,
  PromptMentionRef,
  PromptSegment,
} from '@xgcanvas/shared-types';

import { cleanMentionLabel, type MentionTone } from '../../generation/prompt-mentions';

interface MentionAttrs {
  id?: string;
  label?: string;
  tone?: MentionTone;
  ref?: PromptMentionRef | string;
}

export function promptToTiptapContent(value: string, document?: PromptDocument): JSONContent {
  const source = document?.text === value ? document : undefined;
  const content = source ? segmentsToNodes(source.segments) : textToNodes(value);
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: content.length > 0 ? content : undefined,
      },
    ],
  };
}

export function promptDocumentFromTiptap(json: JSONContent): PromptDocument {
  const segments: PromptSegment[] = [];
  const mentions = new Map<string, PromptMention>();
  let text = '';
  let seenBlock = false;

  const pushText = (value: string) => {
    if (!value) return;
    text += value;
    const prev = segments[segments.length - 1];
    if (prev?.type === 'text') prev.text += value;
    else segments.push({ type: 'text', text: value });
  };

  const visit = (node: JSONContent) => {
    if (node.type === 'text') {
      pushText(node.text ?? '');
      return;
    }
    if (node.type === 'hardBreak') {
      pushText('\n');
      return;
    }
    if (node.type === 'mention') {
      const mention = mentionFromAttrs((node.attrs ?? {}) as MentionAttrs);
      const token = mention.token;
      text += token;
      mentions.set(mention.id, mention);
      segments.push({
        type: 'mention',
        mention_id: mention.id,
        label: mention.label,
        token,
        ref: mention.ref,
      });
      return;
    }
    if (node.type === 'paragraph') {
      if (seenBlock) pushText('\n');
      seenBlock = true;
    }
    for (const child of node.content ?? []) visit(child);
  };

  for (const child of json.content ?? []) visit(child);
  if (segments.length === 0) segments.push({ type: 'text', text: '' });

  return {
    version: 1,
    text,
    mentions: Array.from(mentions.values()),
    segments,
  };
}

export function mentionToneFromRef(ref: PromptMentionRef | undefined): MentionTone {
  if (!ref) return 'unknown';
  if (ref.kind === 'entity' && ref.entity_kind) return `entity-${ref.entity_kind}` as MentionTone;
  if (ref.kind === 'node') return 'node';
  if (ref.asset_type) return `asset-${ref.asset_type}` as MentionTone;
  return 'unknown';
}

function segmentsToNodes(segments: PromptSegment[]): JSONContent[] {
  return segments.flatMap((segment) => {
    if (segment.type === 'mention') {
      return [{
        type: 'mention',
        attrs: {
          id: segment.mention_id,
          label: segment.label,
          tone: mentionToneFromRef(segment.ref),
          ref: segment.ref,
        },
      }];
    }
    return textToNodes(segment.text);
  });
}

function textToNodes(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  const parts = text.split('\n');
  parts.forEach((part, index) => {
    if (part) nodes.push({ type: 'text', text: part });
    if (index < parts.length - 1) nodes.push({ type: 'hardBreak' });
  });
  return nodes;
}

function mentionFromAttrs(attrs: MentionAttrs): PromptMention {
  const ref = normalizeRef(attrs.ref, attrs.id);
  const label = cleanMentionLabel(attrs.label || ref.id || '引用');
  return {
    id: attrs.id || `${ref.kind}:${ref.id}`,
    label,
    token: `@${label}`,
    ref,
  };
}

function normalizeRef(value: MentionAttrs['ref'], fallbackId?: string): PromptMentionRef {
  if (isMentionRef(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isMentionRef(parsed)) return parsed;
    } catch {
      // Ignore malformed HTML attrs and fall through to a harmless placeholder.
    }
  }
  return {
    kind: 'asset',
    id: fallbackId?.split(':').pop() || 'unknown',
  };
}

function isMentionRef(value: unknown): value is PromptMentionRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as PromptMentionRef;
  return (ref.kind === 'asset' || ref.kind === 'entity' || ref.kind === 'node') && typeof ref.id === 'string';
}
