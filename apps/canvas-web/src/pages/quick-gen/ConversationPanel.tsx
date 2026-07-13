import type { Conversation } from './useConversations';

interface Props {
  list: Conversation[];
  activeId: string;
  onSelect(id: string): void;
  onCreate(): void;
  onRemove(id: string): void;
  onRename(c: Conversation): void;
}

const IconNew = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const IconChat = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
  </svg>
);
const IconTrash = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconRename = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** Left rail: 新对话 + conversation list (即梦-style). */
export default function ConversationPanel({ list, activeId, onSelect, onCreate, onRemove, onRename }: Props) {
  return (
    <aside className="qg-conv">
      <div className="qg-conv__title">开启创作</div>
      <button type="button" className="qg-conv__new" onClick={onCreate}>
        {IconNew}
        新对话
      </button>
      <div className="qg-conv__list">
        {list.map((c) => (
          <div
            key={c.id}
            className={`qg-conv__item${c.id === activeId ? ' qg-conv__item--active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            {IconChat}
            <span className="qg-conv__item-title">{c.title}</span>
            <button
              type="button"
              className="qg-conv__iconbtn"
              title="重命名对话"
              aria-label="重命名对话"
              onClick={(e) => {
                e.stopPropagation();
                onRename(c);
              }}
            >
              {IconRename}
            </button>
            {c.id !== 'default' ? (
              <button
                type="button"
                className="qg-conv__iconbtn qg-conv__del"
                title="删除对话"
                aria-label="删除对话"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(c.id);
                }}
              >
                {IconTrash}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
