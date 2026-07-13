import type { FormModeDef } from '../../nodes/types';

interface Props {
  modes: FormModeDef[];
  value: string;
  onChange(id: string): void;
}

/** LibTV-style mode tabs (文生图 / 图生图 / 首尾帧 …). */
export default function ModeTabs({ modes, value, onChange }: Props) {
  return (
    <div className="nif-modes">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`nif-mode${m.id === value ? ' nif-mode--active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
