import WzCheckbox from './WzCheckbox';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'default';

export interface PickItem {
  key: string;
  title: string;
  sub?: string;
  badge?: { text: string; tone?: Tone };
  /** Already-active (enabled preset / imported vendor): shown checked + locked. */
  disabled?: boolean;
}

/** Checkable model list. A disabled item renders as checked-and-locked (it is
 *  already active); everything else toggles the shared `picked` set. */
export function ModelPicklist({
  items,
  picked,
  onToggle,
  empty = '暂无模型',
}: {
  items: PickItem[];
  picked: Set<string>;
  onToggle: (key: string) => void;
  empty?: string;
}) {
  if (items.length === 0) return <div className="set-stat__sub">{empty}</div>;
  return (
    <div className="cwz-models">
      {items.map((it) => (
        <div className="cwz-model" key={it.key}>
          <WzCheckbox
            checked={picked.has(it.key) || !!it.disabled}
            disabled={it.disabled}
            onCheckedChange={() => onToggle(it.key)}
          />
          <div className="cwz-model__main">
            <div className="cwz-model__title">{it.title}</div>
            {it.sub ? <div className="cwz-model__sub">{it.sub}</div> : null}
          </div>
          {it.badge ? (
            <span className={it.badge.tone && it.badge.tone !== 'default' ? `tag tag--${it.badge.tone}` : 'tag'}>
              {it.badge.text}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
