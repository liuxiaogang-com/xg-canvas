import type { PromptDocument } from '@xgcanvas/shared-types';

import MentionInput from '../../components/mention/MentionInput';
import type { MentionCandidate } from '../../generation/prompt-mentions';

interface Props {
  value: string;
  document?: PromptDocument;
  placeholder?: string;
  candidates?: MentionCandidate[];
  onChange(value: string, document: PromptDocument): void;
}

/**
 * TEMP (re-enable after open-source polish — do NOT delete):
 * - @ mention / TipTap mention UX parked until the picker is refined.
 * - Placeholder copy parked with it.
 * Schema still declares `prompt.mention` + placeholder; flip the flags below.
 */
const ENABLE_PROMPT_MENTION = false;
const ENABLE_PROMPT_PLACEHOLDER = false;

export default function PromptField({ value, document, placeholder, candidates = [], onChange }: Props) {
  return (
    <MentionInput
      value={value}
      document={document}
      // candidates={candidates}
      // placeholder={placeholder}
      candidates={ENABLE_PROMPT_MENTION ? candidates : []}
      placeholder={ENABLE_PROMPT_PLACEHOLDER ? placeholder : undefined}
      mentionEnabled={ENABLE_PROMPT_MENTION}
      onChange={onChange}
      // Height/resize owned by .nif-prompt CSS (2-line min, vertical resize).
      maxHeight={280}
      className="nif-prompt nodrag nopan"
    />
  );
}
