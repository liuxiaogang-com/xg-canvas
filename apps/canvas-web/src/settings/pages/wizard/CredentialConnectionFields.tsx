import { Select } from '../../../ui';
import { ErrorNote, TextInput } from '../../components/kit';
import { DreaminaLoginPanel } from './DreaminaLoginPanel';
import { MODALITY_LABEL } from './modality';
import type { CredentialWizardController } from './useCredentialWizard';
import WzCheckbox from './WzCheckbox';

export function CredentialConnectionFields({
  wizard,
}: {
  wizard: CredentialWizardController;
}) {
  return (
    <>
      <div className="cwz-field">
        <span className="cwz-field__label">供应商</span>
        <Select
          value={wizard.providerResourceUid}
          options={wizard.providers.map((provider) => ({
            value: provider.resource_uid,
            label: `${provider.display_name} (${provider.slug})`,
          }))}
          onChange={wizard.setProviderResourceUid}
          placeholder="选择供应商"
        />
      </div>

      <div className="cwz-field">
        <span className="cwz-field__label">调用渠道</span>
        <Select
          value={wizard.channelResourceUid}
          options={wizard.providerChannels.map((channel) => ({
            value: channel.resource_uid,
            label: `${channel.display_name} (${channel.adapter_keys.join(', ')})`,
          }))}
          onChange={wizard.setChannelResourceUid}
          placeholder="选择凭证绑定的渠道"
          disabled={wizard.providerChannels.length === 0}
        />
        {wizard.providerChannels.length === 0 ? (
          <span className="cwz-field__hint">
            该供应商还没有渠道；请先由模型管理员创建渠道，再添加凭证。
          </span>
        ) : (
          <span className="cwz-field__hint">
            凭证只绑定这个渠道；模型列表也只显示可由该渠道调用的模型。
          </span>
        )}
      </div>

      <div className="cwz-field">
        <span className="cwz-field__label">备注</span>
        <TextInput
          value={wizard.label}
          placeholder="便于区分,如 主账号 / A-deepseek"
          onChange={(event) => wizard.setLabel(event.target.value)}
          name="xgcanvas-cred-note"
          autoComplete="off"
        />
      </div>

      <div className="cwz-field">
        <span className="cwz-field__label">支持的功能</span>
        {wizard.availableModalities.length ? (
          <>
            <div className="cwz-caps">
              {wizard.availableModalities.map((modality) => (
                <WzCheckbox
                  key={modality}
                  checked={wizard.modalities.has(modality)}
                  onCheckedChange={() => wizard.toggleModality(modality)}
                >
                  {MODALITY_LABEL[modality]}
                </WzCheckbox>
              ))}
            </div>
            <span className="cwz-field__hint">
              来自该供应商的预置模型,默认全选;取消即筛掉对应模型。
            </span>
          </>
        ) : (
          <span className="cwz-field__hint">
            该供应商暂无预置模型,可填 key 后用「一键获取」拉取。
          </span>
        )}
      </div>

      {wizard.isApiKey ? (
        <div className="cwz-field">
          <span className="cwz-field__label">API Key</span>
          <div className="cwz-row">
            <TextInput
              type="password"
              value={wizard.apiKey}
              placeholder="sk-..."
              onChange={(event) => wizard.setApiKey(event.target.value)}
              style={{ flex: 1 }}
              name="xgcanvas-cred-key"
              autoComplete="new-password"
            />
            {wizard.supportsProbe ? (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={wizard.probe}
                disabled={wizard.probing}
              >
                {wizard.probing ? '获取中…' : '一键获取模型'}
              </button>
            ) : null}
          </div>
          {wizard.supportsProbe ? (
            <span className="cwz-field__hint">
              支持从厂商 /models 拉取补充模型(如 DeepSeek);其余仅用预置清单。
            </span>
          ) : null}
        </div>
      ) : wizard.isCliLogin ? (
        <div className="cwz-field">
          <DreaminaLoginPanel onLogin={() => {}} />
        </div>
      ) : (
        <ErrorNote
          message={`当前接入向导不支持鉴权方式：${wizard.provider?.auth_method ?? 'unknown'}`}
        />
      )}
    </>
  );
}
