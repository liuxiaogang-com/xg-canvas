/* 凭证中心的供应商接入向导。分支与保存语义由 useCredentialWizard 统一管理。 */
import * as Dialog from '@radix-ui/react-dialog';

import { ErrorNote, Loading } from '../components/kit';
import { CredentialConnectionFields } from './wizard/CredentialConnectionFields';
import { CredentialModelSection } from './wizard/CredentialModelSection';
import './wizard/credential-wizard.css';
import type { Modality } from './wizard/modality';
import { useCredentialWizard } from './wizard/useCredentialWizard';
import { useWizardData } from './wizard/useWizardData';

interface AddCredentialWizardProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Prefer this modality when opening from readiness deep-link (?modality=). */
  initialModality?: Modality | null;
}

export function AddCredentialWizard({
  open,
  onClose,
  onSaved,
  initialModality = null,
}: AddCredentialWizardProps) {
  const data = useWizardData(open);
  const wizard = useCredentialWizard({
    open,
    initialModality,
    providers: data.providers,
    channels: data.channels,
    models: data.models,
    onSaved,
    onClose,
  });

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="cwz-overlay" />
        <Dialog.Content
          className="cwz-content"
          aria-describedby="cwz-desc"
          onInteractOutside={(event) => { if (wizard.saving) event.preventDefault(); }}
          onEscapeKeyDown={(event) => { if (wizard.saving) event.preventDefault(); }}
        >
          <div className="cwz-head">
            <Dialog.Title className="cwz-title">接入供应商 / 添加凭证</Dialog.Title>
            <Dialog.Description id="cwz-desc" className="cwz-desc">
              选择供应商和明确的调用渠道，再填写凭证并启用兼容模型。
            </Dialog.Description>
          </div>

          <div className="cwz-body">
            {/* off-screen decoys soak up password-manager autofill so 备注 stays clean */}
            <input
              className="cwz-decoy"
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden
            />
            <input
              className="cwz-decoy"
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden
            />

            {data.loading ? (
              <Loading label="加载供应商与模型…" />
            ) : data.error ? (
              <ErrorNote message={data.error} />
            ) : (
              <>
                <CredentialConnectionFields wizard={wizard} />
                <CredentialModelSection wizard={wizard} />
              </>
            )}
          </div>

          <div className="cwz-foot">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={wizard.saving}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={wizard.save}
              disabled={
                wizard.saving ||
                !wizard.providerResourceUid ||
                !wizard.channelResourceUid ||
                !wizard.supportedAuth ||
                (!wizard.isCliLogin && !wizard.apiKey.trim())
              }
            >
              {wizard.saving
                ? '保存中…'
                : `保存${wizard.picked.size ? ` (启用 ${wizard.picked.size})` : ''}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
