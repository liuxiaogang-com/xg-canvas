import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

import type { MentionCandidate } from '../../generation/prompt-mentions';

export type MentionSuggestionProps = SuggestionProps<MentionCandidate, MentionCandidate>;

export interface MentionSuggestionListRef {
  onKeyDown(props: SuggestionKeyDownProps): boolean;
}

const MentionSuggestionList = forwardRef<MentionSuggestionListRef, MentionSuggestionProps>(
  ({ items, command, loading }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === 'ArrowDown') {
          setSelectedIndex((index) => (items.length ? (index + 1) % items.length : 0));
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((index) => (items.length ? (index - 1 + items.length) % items.length : 0));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (loading) return <div className="mention-menu__empty">加载引用中...</div>;
    if (!items.length) return <div className="mention-menu__empty">没有匹配的引用</div>;

    return (
      <div className="mention-menu">
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={[
              'mention-menu__item',
              `mention-menu__item--${item.tone}`,
              index === selectedIndex ? 'mention-menu__item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              selectItem(index);
            }}
          >
            <span className="mention-menu__icon" aria-hidden>{toneIcon(item.tone)}</span>
            <span className="mention-menu__copy">
              <span className="mention-menu__label">@{item.label}</span>
              {item.subtitle ? <span className="mention-menu__subtitle">{item.subtitle}</span> : null}
            </span>
          </button>
        ))}
      </div>
    );
  },
);

MentionSuggestionList.displayName = 'MentionSuggestionList';

export default MentionSuggestionList;

function toneIcon(tone: MentionCandidate['tone']): string {
  if (tone === 'asset-image') return '图';
  if (tone === 'asset-video') return '视';
  if (tone === 'asset-audio') return '音';
  if (tone.startsWith('entity-')) return '角';
  if (tone === 'node') return '节';
  return '@';
}
