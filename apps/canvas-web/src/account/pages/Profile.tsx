import { SettingsPage, Field, TextInput } from '../../settings/components/kit';
import { useAuthStore } from '../../store/auth';
import { usePermStore, useHasAnySystem } from '../../store/permissions';

/** Minimal read-only profile for P0. Editing + bound login methods land in P1. */
export default function AccountProfile() {
  const me = useAuthStore((s) => s.me);
  // Role display follows the RBAC capability system (same signal that gates /settings),
  // not the vestigial workspace role — so RBAC admins aren't mislabelled as 成员.
  const hasSystem = useHasAnySystem();
  const isSuper = usePermStore((s) => s.isSuper);
  if (!me) return null;
  const roleLabel = isSuper ? '超级管理员' : hasSystem ? '管理员' : '成员';
  return (
    <SettingsPage title="个人资料" description="你的账号基本信息">
      <Field label="邮箱">
        <TextInput value={me.email ?? ''} readOnly />
      </Field>
      <Field label="角色" hint={hasSystem ? '可访问系统管理后台' : '普通成员'}>
        <TextInput value={roleLabel} readOnly />
      </Field>
    </SettingsPage>
  );
}
