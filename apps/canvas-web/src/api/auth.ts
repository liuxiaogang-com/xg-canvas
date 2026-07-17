import { api } from './client';

export interface Me {
  user_id: string;
  email: string;
  workspace_id: string;
}

export interface AuthResult {
  token: string;
  workspace_id: string;
  user: { id: string; email: string; display_name: string; avatar_url: string | null };
}

export interface AuthConfig {
  methods: string[]; // password | email_code | phone_code | wechat | feishu
  oauth: string[]; // actual provider keys to build buttons: wechat_oa | wechat_open | feishu
}

export interface SendCodeResult {
  sent: boolean;
  devCode?: string; // non-production only, so the flow is testable without a real sender
}

export interface SetupStatus {
  required: boolean;
}

export interface MagicResult {
  sent: boolean;
  devToken?: string;
}

export const authApi = {
  config: () => api<AuthConfig>('/auth/config'),
  register: (email: string, password: string, displayName: string) =>
    api<AuthResult>('/auth/register', { method: 'POST', body: { email, password, display_name: displayName } }),
  login: (email: string, password: string) =>
    api<AuthResult>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<Me>('/auth/me'),
  sendEmailCode: (email: string) =>
    api<SendCodeResult>('/auth/email/code', { method: 'POST', body: { email } }),
  emailLogin: (email: string, code: string) =>
    api<AuthResult>('/auth/email/login', { method: 'POST', body: { email, code } }),
  sendPhoneCode: (phone: string) =>
    api<SendCodeResult>('/auth/phone/code', { method: 'POST', body: { phone } }),
  phoneLogin: (phone: string, code: string) =>
    api<AuthResult>('/auth/phone/login', { method: 'POST', body: { phone, code } }),
  sendMagic: (email: string) =>
    api<MagicResult>('/auth/email/magic', { method: 'POST', body: { email } }),
};

export const setupApi = {
  status: () => api<SetupStatus>('/setup/status'),
  complete: (body: { email: string; password: string; display_name: string }) =>
    api<AuthResult>('/setup/complete', { method: 'POST', body }),
};

/** Kick off a full-page OAuth redirect (login or, when authed, bind). */
export function oauthStart(key: string, mode: 'login' | 'bind' = 'login'): void {
  const base = mode === 'bind' ? `/api/v1/me/identities/oauth/${key}/start` : `/api/v1/auth/oauth/${key}/start`;
  window.location.assign(base);
}
