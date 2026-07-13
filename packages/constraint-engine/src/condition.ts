import type {
  ConditionExpr,
  ComparisonCondition,
  AndCondition,
  OrCondition,
  NotCondition,
} from './types';

/**
 * 评估条件表达式
 * 纯函数，根据当前参数值判断条件是否成立
 */
export function evaluateCondition(
  condition: ConditionExpr,
  values: Record<string, any>
): boolean {
  if ('and' in condition) {
    return evaluateAnd(condition, values);
  }
  if ('or' in condition) {
    return evaluateOr(condition, values);
  }
  if ('not' in condition) {
    return evaluateNot(condition, values);
  }
  return evaluateComparison(condition, values);
}

function evaluateComparison(
  condition: ComparisonCondition,
  values: Record<string, any>
): boolean {
  const fieldValue = values[condition.field];

  switch (condition.op) {
    case 'eq':
      return fieldValue === condition.value;

    case 'neq':
      return fieldValue !== condition.value;

    case 'in': {
      const arr = condition.value;
      if (!Array.isArray(arr)) return false;
      return arr.includes(fieldValue);
    }

    case 'nin': {
      const arr = condition.value;
      if (!Array.isArray(arr)) return false;
      return !arr.includes(fieldValue);
    }

    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > condition.value;

    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < condition.value;

    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= condition.value;

    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= condition.value;

    default:
      return false;
  }
}

function evaluateAnd(
  condition: AndCondition,
  values: Record<string, any>
): boolean {
  return condition.and.every((c) => evaluateCondition(c, values));
}

function evaluateOr(
  condition: OrCondition,
  values: Record<string, any>
): boolean {
  return condition.or.some((c) => evaluateCondition(c, values));
}

function evaluateNot(
  condition: NotCondition,
  values: Record<string, any>
): boolean {
  return !evaluateCondition(condition.not, values);
}
