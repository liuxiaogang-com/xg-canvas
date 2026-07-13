/** A bound login method shown in the personal center. */
export interface IdentityView {
  id: string;
  provider: string;
  label: string;
  verified: boolean;
  is_primary: boolean;
  created_at: string;
}

/** A logged-in device/session as shown in the personal center (mirror of the
 *  server's SessionDeviceView; dates arrive as ISO strings). */
export interface SessionView {
  id: string;
  device_label: string | null;
  platform: string | null;
  user_agent: string | null;
  last_ip: string | null;
  created_via: string | null;
  last_seen_at: string;
  created_at: string;
  is_current: boolean;
}
