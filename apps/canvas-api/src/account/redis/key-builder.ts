/**
 * Redis key builder. Every key in XG Canvas lives under the global `xgcanvas:`
 * prefix (set on the ioredis client) plus a module namespace below.
 *
 * Convention: `xgcanvas:<module>:<subspace>:<id...>`
 */

export const RedisKeys = {
  registry: {
    /** Catalog Snapshot revision metadata: load time, count, epoch and digest. */
    revision: () => 'registry:revision',
  },
} as const;
