import { api } from '../api/client';
import type { SendCodeResult } from '../api/auth';
import type { IdentityView, SessionView } from './types';

export const accountApi = {
  /** Active devices/sessions for the current user. */
  sessions: () => api<SessionView[]>('/me/sessions'),
  /** Kick a device; it fails on its next request. */
  revokeSession: (id: string) => api<void>(`/me/sessions/${id}/revoke`, { method: 'POST' }),

  /** Bound login methods. */
  identities: () => api<IdentityView[]>('/me/identities'),
  unbindIdentity: (id: string) => api<void>(`/me/identities/${id}`, { method: 'DELETE' }),
  sendBindEmailCode: (email: string) =>
    api<SendCodeResult>('/me/identities/bind/email/code', { method: 'POST', body: { email } }),
  bindEmail: (email: string, code: string) =>
    api<{ bound: true }>('/me/identities/bind/email', { method: 'POST', body: { email, code } }),
  sendBindPhoneCode: (phone: string) =>
    api<SendCodeResult>('/me/identities/bind/phone/code', { method: 'POST', body: { phone } }),
  bindPhone: (phone: string, code: string) =>
    api<{ bound: true }>('/me/identities/bind/phone', { method: 'POST', body: { phone, code } }),

  // Conflict resolution: send a merge_confirm code to the contested contact, then
  // either steal just that identity (force-bind) or absorb the whole account (merge).
  sendMergeCode: (channel: 'email' | 'phone', target: string) =>
    api<SendCodeResult>('/me/account/confirm-code', { method: 'POST', body: { channel, target } }),
  forceBind: (channel: 'email' | 'phone', target: string, code: string) =>
    api<void>('/me/account/force-bind', { method: 'POST', body: { channel, target, code } }),
  mergeAccount: (channel: 'email' | 'phone', target: string, code: string) =>
    api<void>('/me/account/merge', { method: 'POST', body: { channel, target, code } }),

  // OAuth conflict resolution: the proven identity was stashed server-side by the
  // bind redirect, so these need no extra proof.
  oauthForceBind: () => api<void>('/me/account/oauth/force-bind', { method: 'POST' }),
  oauthMerge: () => api<void>('/me/account/oauth/merge', { method: 'POST' }),
};
