import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { mergeAttributes } from '@tiptap/core';
import type { Editor, JSONContent, Range } from '@tiptap/core';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { PromptDocument, PromptMentionRef } from '@xgcanvas/shared-types';

import type { MentionCandidate } from '../../generation/prompt-mentions';
import MentionSuggestionList from './MentionSuggestionList';
import type { MentionSuggestionListRef, MentionSuggestionProps } from './MentionSuggestionList';
import {
  mentionToneFromRef,
  promptDocumentFromTiptap,
  promptToTiptapContent,
} from './tiptap-prompt-document';
import './MentionInput.css';

interface Props {
  value: string;
  document?: PromptDocument;
  candidates?: MentionCandidate[];
  placeholder?: string;
  className?: string;
  maxHeight?: number;
  /** When false, TipTap Mention / @ suggestion is not registered. Default true. */
  mentionEnabled?: boolean;
  onChange(value: string, document: PromptDocument): void;
  onSubmit?(): void;
}

export default function MentionInput({
  value,
  document,
  candidates = [],
  placeholder,
  className,
  maxHeight = 160,
  mentionEnabled = true,
  onChange,
  onSubmit,
}: Props) {
  const candidatesRef = useRef(candidates);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSubmitRef.current = onSubmit;
  }, [onChange, onSubmit]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              emptyEditorClass: 'mention-editor--empty',
            }),
          ]
        : []),
      // @ mention parked with mentionEnabled=false — keep createResourceMention, do not delete.
      ...(mentionEnabled ? [createResourceMention(candidatesRef)] : []),
    ],
    [placeholder, mentionEnabled],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: promptToTiptapContent(value, document),
    editorProps: {
      attributes: {
        class: 'mention-editor__surface',
        style: `max-height:${maxHeight}px`,
      },
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey && onSubmitRef.current) {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: activeEditor }) {
      const next = promptDocumentFromTiptap(activeEditor.getJSON());
      onChangeRef.current(next.text, next);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = promptDocumentFromTiptap(editor.getJSON());
    if (current.text !== value) {
      editor.commands.setContent(promptToTiptapContent(value, document), { emitUpdate: false });
    }
  }, [document, editor, value]);

  return (
    <div className={['mention-input', className].filter(Boolean).join(' ')}>
      <EditorContent className="mention-editor" editor={editor} />
    </div>
  );
}

function createResourceMention(candidatesRef: MutableRefObject<MentionCandidate[]>) {
  return Mention.extend({
    addAttributes() {
      const parent = this.parent?.() ?? {};
      return {
        ...parent,
        tone: {
          default: 'unknown',
          parseHTML: (element: HTMLElement) => element.getAttribute('data-tone') ?? 'unknown',
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-tone': String(attrs.tone ?? 'unknown') }),
        },
        ref: {
          default: null,
          parseHTML: (element: HTMLElement) => safeParseRef(element.getAttribute('data-ref')),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.ref ? { 'data-ref': JSON.stringify(attrs.ref) } : {},
        },
      };
    },
  }).configure({
    renderText({ node }: { node: { attrs: Record<string, unknown> } }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    renderHTML({ node, options }: {
      node: { attrs: Record<string, unknown> };
      options: { HTMLAttributes: Record<string, unknown> };
    }) {
      const tone = String(node.attrs.tone ?? mentionToneFromRef(node.attrs.ref as PromptMentionRef | undefined));
      return [
        'span',
        mergeAttributes(options.HTMLAttributes, {
          'data-type': 'mention',
          'data-tone': tone,
          'data-ref': node.attrs.ref ? JSON.stringify(node.attrs.ref) : undefined,
          class: `mention-token mention-token--${tone}`,
        }),
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: '@',
      allowedPrefixes: null,
      placement: 'top-start',
      offset: { mainAxis: 8 },
      floatingUi: { strategy: 'fixed' },
      items: ({ query }: { query: string }) => {
        const q = query.toLowerCase();
        return candidatesRef.current
          .filter((item) => {
            const haystack = `${item.label} ${item.subtitle ?? ''}`.toLowerCase();
            return !q || haystack.includes(q);
          })
          .slice(0, 8);
      },
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: MentionCandidate }) =>
        insertMention(editor, range, props),
      render: () => createSuggestionRenderer(),
    } as never,
  } as never);
}

function insertMention(editor: Editor, range: Range, candidate: MentionCandidate): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: 'mention',
        attrs: {
          id: candidate.key,
          label: candidate.label,
          tone: candidate.tone,
          ref: candidate.ref,
        },
      },
      { type: 'text', text: ' ' },
    ] as JSONContent[])
    .run();
}

function createSuggestionRenderer() {
  let component: ReactRenderer<MentionSuggestionListRef, MentionSuggestionProps> | null = null;
  let unmount: (() => void) | null = null;

  return {
    onStart(props: MentionSuggestionProps) {
      component = new ReactRenderer<MentionSuggestionListRef, MentionSuggestionProps>(MentionSuggestionList, {
        props,
        editor: props.editor,
        className: 'mention-renderer',
      });
      unmount = props.mount(component.element, { autoUpdate: { animationFrame: true } });
    },
    onUpdate(props: MentionSuggestionProps) {
      component?.updateProps(props);
    },
    onKeyDown(props: SuggestionKeyDownProps) {
      return component?.ref?.onKeyDown(props) ?? false;
    },
    onExit() {
      unmount?.();
      component?.destroy();
      component = null;
      unmount = null;
    },
  };
}

function safeParseRef(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
