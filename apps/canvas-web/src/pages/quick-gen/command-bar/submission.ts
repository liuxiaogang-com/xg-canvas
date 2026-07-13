import type { ModelInputContract } from '@xgcanvas/shared-types';

import {
  ensureInputMode,
  filterRefsForSlots,
  missingRequiredSlots,
  modeContract,
  slotsForMode,
  type GenerationSlotView,
} from '../../../generation/input-contract-ui';
import {
  buildPromptDocument,
  mergeGenerationReferences,
  promptDocumentReferences,
} from '../../../generation/prompt-mentions';
import type { CommandBarState } from '../types';
import { TASK_TYPE_BY_MODE } from '../types';

export interface QuickGenSubmission {
  task_type: string;
  model_id: string;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
}

export type SubmissionFailure =
  | { reason: 'missing_model' }
  | { reason: 'empty_input' }
  | { reason: 'missing_required_slot'; slot: GenerationSlotView };

export function buildQuickGenSubmission(
  state: CommandBarState,
  inputContract?: ModelInputContract,
  options: { preferPromptOnlyMode?: boolean } = {},
): { ok: true; submission: QuickGenSubmission } | { ok: false; failure: SubmissionFailure } {
  if (!state.modelId) return { ok: false, failure: { reason: 'missing_model' } };

  const inputMode = submissionInputMode(inputContract, state.inputMode, options.preferPromptOnlyMode);
  const activeMode = modeContract(inputContract, inputMode);
  const referenceSlots = slotsForMode(activeMode);
  const activeReferences = filterRefsForSlots(state.references, referenceSlots);
  const promptDoc = state.promptDoc ?? buildPromptDocument(state.prompt, []);
  const mentionReferences = promptDocumentReferences(promptDoc, referenceSlots);
  const references = mergeGenerationReferences(activeReferences, mentionReferences, referenceSlots);

  if (!state.prompt.trim() && references.length === 0) return { ok: false, failure: { reason: 'empty_input' } };

  const missing = missingRequiredSlots(referenceSlots, references);
  if (missing.length > 0) return { ok: false, failure: { reason: 'missing_required_slot', slot: missing[0] } };

  const inputs: Record<string, unknown> = {
    prompt: state.prompt,
    prompt_doc: promptDoc,
    references,
  };
  if (inputMode) inputs.mode = inputMode;

  return {
    ok: true,
    submission: {
      task_type: TASK_TYPE_BY_MODE[state.mode],
      model_id: state.modelId,
      params: state.params,
      inputs,
    },
  };
}

function submissionInputMode(
  contract: ModelInputContract | undefined,
  current: string | null | undefined,
  preferPromptOnlyMode = false,
): string | null {
  if (!preferPromptOnlyMode) return ensureInputMode(contract, current);
  const promptOnly = contract?.modes?.find((mode) => (mode.required_slots?.length ?? 0) === 0);
  return promptOnly?.id ?? ensureInputMode(contract, current);
}
