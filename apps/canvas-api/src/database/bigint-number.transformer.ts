import type { ValueTransformer } from 'typeorm';

/** Safe for columns whose domain is explicitly capped below Number.MAX_SAFE_INTEGER. */
export const bigintNumberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => value == null ? value : Number(value),
};
