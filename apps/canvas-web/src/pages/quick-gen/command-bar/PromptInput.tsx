import type { PromptDocument } from '@xgcanvas/shared-types';

import MentionInput from '../../../components/mention/MentionInput';
import type { MentionCandidate } from '../../../generation/prompt-mentions';

interface Props {
  value: string;
  document?: PromptDocument;
  candidates?: MentionCandidate[];
  onChange(value: string, document: PromptDocument): void;
  onSubmit(): void;
  placeholder?: string;
}

export default function PromptInput({ value, document, candidates = [], onChange, onSubmit, placeholder }: Props) {
  return (
    <MentionInput
      value={value}
      document={document}
      candidates={candidates}
      onChange={onChange}
      onSubmit={onSubmit}
      maxHeight={160}
      placeholder={placeholder ?? '输入想法、剧本或上传参考，@引用素材'}
      className="qg-bar__mention"
    />
  );
}
