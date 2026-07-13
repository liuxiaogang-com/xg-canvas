/** Lowercase + trim. Used as the email identity's provider_uid. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Best-effort E.164. CN mobiles get +86; already-international kept as-is. */
export function normalizePhone(phone: string): string {
  const t = phone.trim().replace(/[\s-]/g, '');
  if (t.startsWith('+')) return t;
  if (/^0086\d+$/.test(t)) return `+${t.slice(2)}`;
  if (/^1\d{10}$/.test(t)) return `+86${t}`;
  return t;
}
