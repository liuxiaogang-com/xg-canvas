import { useId } from 'react';

import './brand.css';

/** Brand glyph — gradient node-graph tile (theme-token colors). */
export function BrandMark({ size = 38 }: { size?: number }) {
  const gradientId = useId();

  return (
    <svg
      className="auth-brand__mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-canvas-accent)" />
          <stop offset="1" stopColor="var(--color-cyan)" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill={`url(#${gradientId})`} />
      <g stroke="#fff" strokeOpacity="0.92" strokeWidth="1.8" strokeLinecap="round">
        <path d="M13 14 L26 12" />
        <path d="M13 14 L20 27" />
        <path d="M20 27 L28 24" />
      </g>
      <g fill="#fff">
        <circle cx="13" cy="14" r="3.4" />
        <circle cx="27" cy="12" r="2.8" />
        <circle cx="20" cy="27" r="2.8" />
        <circle cx="28" cy="24" r="2.4" />
      </g>
    </svg>
  );
}

export function BrandLockup({ markSize = 38 }: { markSize?: number }) {
  return (
    <div className="auth-brand">
      <BrandMark size={markSize} />
      <span className="auth-brand__word">XG Canvas</span>
    </div>
  );
}
