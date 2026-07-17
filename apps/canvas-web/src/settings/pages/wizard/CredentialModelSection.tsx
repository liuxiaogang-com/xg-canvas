import { ModelPicklist } from './ModelPicklist';
import type { CredentialWizardController } from './useCredentialWizard';

export function CredentialModelSection({
  wizard,
}: {
  wizard: CredentialWizardController;
}) {
  const hasImportableVendorModel = wizard.vendorModels?.some((model) => !model.imported);

  return (
    <div className="cwz-field">
      <span className="cwz-field__label">要启用的模型</span>
      {wizard.probeNote ? <span className="cwz-field__hint">{wizard.probeNote}</span> : null}
      {hasImportableVendorModel ? (
        <label className="cwz-field__hint" style={{ display: 'flex', gap: 8 }}>
          <input
            type="checkbox"
            checked={wizard.vendorContractConfirmed}
            disabled={!wizard.channel?.adapter_keys.includes('openai-compat')}
            onChange={(event) => wizard.confirmVendorContract(event.target.checked)}
          />
          <span>
            我确认厂商拉取的所选 ID 是 OpenAI 兼容的流式文本模型；
            <code>/models</code> 无法自动判断模型能力。
          </span>
        </label>
      ) : null}
      <ModelPicklist
        items={wizard.items}
        picked={wizard.picked}
        onToggle={wizard.toggleModel}
        empty={wizard.availableModalities.length
          ? '当前功能下没有模型'
          : '暂无模型,填 key 后可一键获取'}
      />
    </div>
  );
}
