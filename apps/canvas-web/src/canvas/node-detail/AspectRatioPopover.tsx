import { useState } from 'react';

import './AspectRatioPopover.css';

const RATIOS = ['智能', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'] as const;
const RESOLUTIONS = ['高清 2K', '超清 4K'] as const;

export interface AspectRatioValue {
  ratio: string;
  resolution: string;
  width: number;
  height: number;
}

interface Props {
  value: Partial<AspectRatioValue>;
  onChange(v: AspectRatioValue): void;
}

/** Dark variant of the design's aspect-ratio popover. Three sections:
 * ratio chips, resolution toggle, W/H inputs (linked when locked). */
export default function AspectRatioPopover({ value, onChange }: Props) {
  const [ratio, setRatio] = useState(value.ratio ?? '1:1');
  const [resolution, setResolution] = useState(value.resolution ?? '高清 2K');
  const [width, setWidth] = useState(value.width ?? 2048);
  const [height, setHeight] = useState(value.height ?? 2048);
  const [linked, setLinked] = useState(true);

  const apply = (next: Partial<AspectRatioValue>) => {
    onChange({ ratio, resolution, width, height, ...next });
  };

  const onWidthChange = (v: number) => {
    setWidth(v);
    if (linked) setHeight(v);
    apply({ width: v, ...(linked ? { height: v } : {}) });
  };

  const onHeightChange = (v: number) => {
    setHeight(v);
    if (linked) setWidth(v);
    apply({ height: v, ...(linked ? { width: v } : {}) });
  };

  return (
    <div className="ar-pop" role="dialog">
      <section className="ar-pop__sec">
        <div className="ar-pop__chips">
          {RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              className={`ar-chip${ratio === r ? ' ar-chip--active' : ''}`}
              onClick={() => {
                setRatio(r);
                apply({ ratio: r });
              }}
            >
              <span className="ar-chip__icon" data-ratio={r} aria-hidden />
              <span className="ar-chip__label">{r === '智能' ? '智能' : r}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ar-pop__sec">
        <div className="ar-pop__sec-title">选择分辨率</div>
        <div className="ar-pop__resolutions">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`ar-pill${resolution === r ? ' ar-pill--active' : ''}`}
              onClick={() => {
                setResolution(r);
                apply({ resolution: r });
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <section className="ar-pop__sec">
        <div className="ar-pop__sec-title">尺寸</div>
        <div className="ar-pop__size">
          <label className="ar-size">
            <span className="ar-size__label">W</span>
            <input
              type="number"
              className="ar-size__input"
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value) || 0)}
            />
          </label>
          <button
            type="button"
            className={`ar-pop__link${linked ? ' ar-pop__link--on' : ''}`}
            onClick={() => setLinked((v) => !v)}
            aria-label={linked ? '取消等比' : '锁定等比'}
            title={linked ? '取消等比' : '锁定等比'}
          >
            ⌘
          </button>
          <label className="ar-size">
            <span className="ar-size__label">H</span>
            <input
              type="number"
              className="ar-size__input"
              value={height}
              onChange={(e) => onHeightChange(Number(e.target.value) || 0)}
            />
          </label>
          <span className="ar-size__unit">PX</span>
        </div>
      </section>
    </div>
  );
}
