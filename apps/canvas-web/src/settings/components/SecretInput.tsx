import { Field, TextInput } from './kit';

/** Secret field with saved-mask UX: when configured and not dirty, show bullets placeholder;
 *  omit from API payload unless dirty. Real secrets are never echoed from the server. */
export function SecretInput({
  label,
  configured,
  value,
  dirty,
  onChange,
  onBeginEdit,
  autoComplete = 'new-password',
}: {
  label: string;
  configured: boolean;
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onBeginEdit: () => void;
  autoComplete?: string;
}) {
  const masked = configured && !dirty;
  return (
    <Field
      label={label}
      hint={configured ? '已保存；如需更换请重新输入，留空则保持不变' : undefined}
    >
      <div className="set-secret">
        <TextInput
          type="password"
          value={masked ? '' : value}
          placeholder={masked ? '••••••••' : undefined}
          autoComplete={autoComplete}
          name={`xgcanvas-secret-${label}`}
          onFocus={() => {
            if (masked) onBeginEdit();
          }}
          onChange={(e) => {
            if (!dirty) onBeginEdit();
            onChange(e.target.value);
          }}
        />
        {masked ? (
          <button type="button" className="btn btn--ghost set-secret__change" onClick={onBeginEdit}>
            更换
          </button>
        ) : null}
      </div>
    </Field>
  );
}
