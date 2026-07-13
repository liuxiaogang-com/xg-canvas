const EXCLUDED_NODE_DATA_KEYS = new Set([
  'model_id',
  'mode',
  'output_asset_id',
  'output_text',
  'prompt',
  'prompt_doc',
  'prompt_references',
  'manual_references',
  'status',
  'task_id',
  'title',
  'last_error',
  // Node shell / display fields — never send to vendors.
  'width',
  'height',
  'media_width',
  'media_height',
  'media_type',
  'asset_name',
  'resolution',
]);

export function collectNodeParams(
  data: Record<string, unknown>,
  legacy: Record<string, unknown> = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...legacy };
  for (const [key, value] of Object.entries(data)) {
    if (EXCLUDED_NODE_DATA_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    params[key] = value;
  }
  return params;
}
