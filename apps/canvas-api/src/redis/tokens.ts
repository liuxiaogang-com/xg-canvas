/** Standalone DI token file to break the redis.module ↔ redis.service cycle. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
