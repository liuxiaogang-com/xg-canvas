import type { CostEstimate } from '../../api/model';

export function formatEstimatedCost(cost: CostEstimate): string | null {
  const currency = cost.currency?.trim().toUpperCase();
  if (cost.estimated_cost === null || !currency) return null;

  const amount = String(cost.estimated_cost);
  return currency === 'CNY' ? `¥${amount}` : `${currency} ${amount}`;
}
