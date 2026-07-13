import type { ReactNode } from 'react';

/**
 * Small line icons per node type (16x16, stroke = currentColor). Used as the
 * prefix glyph in the add-node menu and node labels. Inline SVG — no emoji
 * (buerguo ui-003).
 */
const PATHS: Record<string, ReactNode> = {
  asset_input: (
    <>
      <path d="M8 2.4v7.2" />
      <path d="M5.2 6.8L8 9.6l2.8-2.8" />
      <path d="M3 11.2v1.6a1.6 1.6 0 001.6 1.6h6.8A1.6 1.6 0 0013 12.8v-1.6" />
    </>
  ),
  gen_text: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </>
  ),
  gen_image: (
    <>
      <rect x="2.2" y="2.7" width="11.6" height="10.6" rx="2" />
      <circle cx="5.6" cy="6.2" r="1.1" />
      <path d="M3 11.5l3-2.8 3 2.5 2-1.7 2.8 2.4" />
    </>
  ),
  gen_video: (
    <>
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="2" />
      <path d="M6.6 6.2l3.4 1.8-3.4 1.8z" />
    </>
  ),
  gen_audio: (
    <>
      <path d="M6.2 11V4.2l6-1.4v6.6" />
      <circle cx="4.9" cy="11" r="1.3" />
      <circle cx="10.9" cy="9.4" r="1.3" />
    </>
  ),
  audio_transcribe: (
    <>
      <rect x="6.2" y="2.2" width="3.6" height="6.6" rx="1.8" />
      <path d="M4.2 7.6a3.8 3.8 0 007.6 0M8 11.4v2.2M5.8 13.6h4.4" />
    </>
  ),
  script_input: (
    <>
      <path d="M4 2.2h4.8l3 3V13.8H4z" />
      <path d="M8.6 2.4v3h3M6 8.4h4M6 10.8h4" />
    </>
  ),
  entity_character: (
    <>
      <circle cx="8" cy="5.3" r="2.4" />
      <path d="M3.4 13.6a4.6 4.6 0 019.2 0" />
    </>
  ),
  entity_scene: (
    <>
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2" />
      <path d="M2.6 11.2l3.2-3.6 2.4 2.4 2-2 3.2 3.4" />
      <circle cx="11" cy="5.6" r="1" />
    </>
  ),
  entity_prop: (
    <>
      <path d="M8 2.2l5 2.6v5.4L8 13.8l-5-2.6V4.8z" />
      <path d="M8 2.2v3M8 8.4v5.4M3 4.8l5 2.6 5-2.6" />
    </>
  ),
  storyboard_shot: (
    <>
      <rect x="2.2" y="3.4" width="11.6" height="9.2" rx="1.4" />
      <path d="M6 3.6v8.8M10 3.6v8.8" />
    </>
  ),
  grid: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.6" />
      <path d="M8 2.6v10.8M2.6 8h10.8" />
    </>
  ),
};

const FALLBACK = <rect x="3" y="3" width="10" height="10" rx="2" />;

export function NodeIcon({ type, className }: { type: string; className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[type] ?? FALLBACK}
    </svg>
  );
}
