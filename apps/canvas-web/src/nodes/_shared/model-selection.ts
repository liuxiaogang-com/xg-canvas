export function requireSelectedModel(modelId: string | null | undefined): string {
  const selected = modelId?.trim();
  if (!selected) throw new Error('请先选择一个当前可用的模型');
  return selected;
}
