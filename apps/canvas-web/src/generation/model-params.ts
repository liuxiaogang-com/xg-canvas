import type { ParamSpec } from '../api/model';

/** Build the exact parameter object declared by the current Model Revision. */
export function selectCatalogModelParams(
  specs: readonly ParamSpec[],
  defaults: Readonly<Record<string, unknown>>,
  nodeData: Readonly<Record<string, unknown>>,
  mappedParams: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const spec of specs) {
    const candidates = [
      nodeData[spec.field],
      mappedParams[spec.field],
      defaults[spec.field],
      spec.default ?? spec.options?.[0]?.value,
    ];
    const value = candidates.find((candidate) => isUsableParamValue(spec, candidate));
    if (value !== undefined) selected[spec.field] = value;
  }
  return selected;
}

function isUsableParamValue(spec: ParamSpec, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (!spec.options?.length) return true;
  return spec.options.some((option) => String(option.value) === String(value));
}
