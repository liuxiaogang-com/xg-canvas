import * as Checkbox from '@radix-ui/react-checkbox';
import type { ReactNode } from 'react';

/** Radix checkbox styled with our design tokens (see credential-wizard.css).
 *  Used for both the 功能 filter and the model pick list. */
export default function WzCheckbox({
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className={`cwz-check${disabled ? ' cwz-check--disabled' : ''}`}>
      <Checkbox.Root
        className="cwz-check__box"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      >
        <Checkbox.Indicator className="cwz-check__ind">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6.2l2.2 2.2 4.8-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      {children != null ? <span className="cwz-check__label">{children}</span> : null}
    </label>
  );
}
