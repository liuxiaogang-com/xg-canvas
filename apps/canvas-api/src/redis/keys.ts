const join = (...parts: (string | number)[]) => parts.join(':');

export const Keys = {
  task: {
    status: (taskId: string) => join('task', 'status', taskId),
    progress: (taskId: string) => join('task', 'progress', taskId),
  },
  lock: (resource: string, id: string) => join('lock', resource, id),
  // Pending direct-upload draft (intent issued, object not yet confirmed).
  assetUploadDraft: (draftId: string) => join('asset', 'upload', draftId),
  // Opaque-session liveness cache. `h` = hex sha256(token). Truth is in
  // canvas.auth_sessions; these are a rebuildable cache + instant-kick tombstone.
  session: {
    live: (h: string) => join('session', h),
    revoked: (h: string) => join('session', 'revoked', h),
    userSet: (userId: string) => join('user', 'sessions', userId),
  },
  // A proven OAuth identity awaiting force-bind/merge confirmation after a bind conflict.
  oauthPending: (userId: string) => join('oauth_pending', userId),
  // Resolved RBAC capability set per (user, scope). userSet tracks a user's keys for invalidation.
  authz: {
    caps: (userId: string, scopeKind: string, scopeId: string | null) =>
      join('authz', 'caps', userId, scopeKind, scopeId ?? '-'),
    userSet: (userId: string) => join('authz', 'cuser', userId),
  },
} as const;
