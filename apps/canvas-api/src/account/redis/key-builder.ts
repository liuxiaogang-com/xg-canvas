/**
 * Redis key builder. Every key in XG Canvas lives under the global `xgcanvas:`
 * prefix (set on the ioredis client) plus a module namespace below.
 *
 * Convention: `xgcanvas:<module>:<subspace>:<id...>`
 */

const join = (...parts: (string | number)[]) => parts.join(':');

export const RedisKeys = {
  registry: {
    /** Cached YAML manifest hash. Bumped on `/registry/reload`. */
    revision: () => 'registry:revision',
    /** Cached entry by model_id. */
    entry: (modelId: string) => join('registry', 'entry', modelId),
  },

  invoke: {
    /** Per-credential token-bucket counter (rpm/tpm enforcement). */
    rateLimit: (channelId: string, credentialId: string, bucket: 'rpm' | 'tpm') =>
      join('invoke', 'rl', channelId, credentialId, bucket),
    /** Daily quota counter, rolling YYYY-MM-DD suffix. */
    dailyQuota: (channelId: string, ymd: string) =>
      join('invoke', 'quota', channelId, ymd),
    /** Concurrency lease set. */
    concurrency: (channelId: string) => join('invoke', 'conc', channelId),
  },

  task: {
    /** Distributed lock for poll workers. */
    pollLock: (taskId: string) => join('task', 'lock', taskId),
    /** Cached task status snapshot for fast frontend polling. */
    status: (taskId: string) => join('task', 'status', taskId),
  },

  cli: {
    /** dreamina login session state, by login_id. */
    dreaminaLogin: (loginId: string) => join('cli', 'dreamina', 'login', loginId),
  },
} as const;
