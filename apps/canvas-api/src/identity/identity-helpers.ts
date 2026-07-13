import type { AuthIdentity } from '../database/entities';

export interface IdentityView {
  id: string;
  provider: string;
  label: string;
  verified: boolean;
  is_primary: boolean;
  created_at: Date;
}

export function identityLabel(i: AuthIdentity): string {
  if (i.provider === 'email' || i.provider === 'phone' || i.provider === 'password') return i.provider_uid;
  const nick = (i.raw_profile as { displayName?: string } | null)?.displayName;
  return nick || i.provider_uid;
}

/** Distinct usable login-method groups; the WeChat family counts once and an
 *  unverified email/phone doesn't count. Drives the "≥1 login method" invariant. */
export function loginMethodCount(rows: AuthIdentity[], excludeId?: string): number {
  const groups = new Set<string>();
  for (const i of rows) {
    if (excludeId && i.id === excludeId) continue;
    if (i.provider === 'password') groups.add('password');
    else if ((i.provider === 'email' || i.provider === 'phone') && i.verified_at) groups.add(i.provider);
    else if (i.provider.startsWith('wechat')) groups.add('wechat');
    else if (i.provider === 'feishu') groups.add('feishu');
    else if (i.provider === 'mock') groups.add('mock');
  }
  return groups.size;
}
