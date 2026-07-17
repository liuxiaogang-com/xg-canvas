import type { TaskType } from './task';

/** Build-time/runtime contract for adapters shipped in this repository. */
export const BUILTIN_ADAPTER_CAPABILITIES = {
  'openai-compat': ['gen.text'],
  'bailian-dashscope': ['gen.image', 'gen.video'],
  'dreamina-cli': ['gen.image', 'gen.video'],
} as const satisfies Record<string, readonly TaskType[]>;

export type BuiltinAdapterKey = keyof typeof BUILTIN_ADAPTER_CAPABILITIES;
export const BUILTIN_ADAPTER_KEYS = Object.freeze(
  Object.keys(BUILTIN_ADAPTER_CAPABILITIES) as BuiltinAdapterKey[],
);
