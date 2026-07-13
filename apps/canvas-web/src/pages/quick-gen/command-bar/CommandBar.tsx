import { toast } from '../../../ui';
import type { ModelInputContract, PromptDocument } from '@xgcanvas/shared-types';
import type { ParamSpec } from '../../../api/model';
import {
  ensureInputMode,
  modeContract,
  quickModeOptions,
  slotsForMode,
  splitModelVersionParam,
} from '../../../generation/input-contract-ui';
import { buildPromptDocument } from '../../../generation/prompt-mentions';
import type { CommandBarState, GenMode } from '../types';
import InputModeSwitch from './InputModeSwitch';
import ModeSwitch from './ModeSwitch';
import PromptInput from './PromptInput';
import ModelPicker from './ModelPicker';
import ModelVersionPicker from './ModelVersionPicker';
import ParamPopover from './ParamPopover';
import ReferenceUploader from './ReferenceUploader';
import SendButton from './SendButton';
import { useQuickMentionCandidates } from './useQuickMentionCandidates';
import { buildQuickGenSubmission, type QuickGenSubmission } from './submission';

interface Props {
  state: CommandBarState;
  specs: ParamSpec[];
  inputContract?: ModelInputContract;
  onModeChange(mode: GenMode): void;
  onModelChange(id: string | null): void;
  onInputModeChange(mode: string): void;
  onPromptChange(prompt: string, promptDoc?: PromptDocument): void;
  onParamChange(k: string, v: unknown): void;
  onReferencesChange(r: CommandBarState['references']): void;
  onSubmit(s: QuickGenSubmission): Promise<void>;
  loading?: boolean;
}

export default function CommandBar(props: Props) {
  const {
    state,
    specs,
    inputContract,
    onModeChange,
    onModelChange,
    onInputModeChange,
    onPromptChange,
    onParamChange,
    onReferencesChange,
    onSubmit,
    loading,
  } = props;
  const inputMode = ensureInputMode(inputContract, state.inputMode);
  const inputModes = quickModeOptions(inputContract);
  const activeMode = modeContract(inputContract, inputMode);
  const referenceSlots = slotsForMode(activeMode);
  const mentionCandidates = useQuickMentionCandidates();
  const promptDoc = state.promptDoc ?? buildPromptDocument(state.prompt, []);
  const { modelVersionSpec, paramSpecs } = splitModelVersionParam(specs);
  const built = buildQuickGenSubmission(state, inputContract);
  const canSubmit = built.ok;

  const submit = async () => {
    const result = buildQuickGenSubmission(state, inputContract);
    if (!result.ok) {
      if (result.failure.reason === 'missing_model') toast.warning('请先选择生成类型');
      if (result.failure.reason === 'empty_input') toast.warning('请先输入提示词或添加参考内容');
      if (result.failure.reason === 'missing_required_slot') toast.warning(`请先补充${result.failure.slot.label}`);
      return;
    }
    await onSubmit(result.submission);
  };

  return (
    <div className="qg-bar">
      {referenceSlots.length ? (
        <ReferenceUploader slots={referenceSlots} references={state.references} onChange={onReferencesChange} />
      ) : null}

      <PromptInput
        value={state.prompt}
        document={promptDoc}
        candidates={mentionCandidates}
        onChange={onPromptChange}
        onSubmit={submit}
      />

      <div className="qg-bar__row">
        <ModeSwitch value={state.mode} onChange={onModeChange} />
        <ModelVersionPicker
          spec={modelVersionSpec}
          value={state.params.model_version}
          sourceLabel={sourceLabelFromModelId(state.modelId)}
          onChange={(v) => onParamChange('model_version', v)}
        />
        <ModelPicker mode={state.mode} value={state.modelId} onChange={onModelChange} />
        {inputModes.length > 1 ? <InputModeSwitch modes={inputModes} value={inputMode} onChange={onInputModeChange} /> : null}
        <ParamPopover specs={paramSpecs} params={state.params} onChange={onParamChange} />
        <div className="qg-bar__spacer" />
        <SendButton onClick={submit} loading={loading} disabled={!canSubmit} />
      </div>
    </div>
  );
}

function sourceLabelFromModelId(modelId: string | null): string | undefined {
  if (modelId?.startsWith('dreamina:')) return '即梦 CLI';
  return undefined;
}
