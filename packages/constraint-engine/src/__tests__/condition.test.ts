import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../condition';

describe('evaluateCondition', () => {
  const values = {
    generation_mode: 'first_last_frame',
    temperature: 0.7,
    style: 'vivid',
    count: 5,
  };

  describe('比较操作符', () => {
    it('eq: 等于', () => {
      expect(evaluateCondition({ field: 'generation_mode', op: 'eq', value: 'first_last_frame' }, values)).toBe(true);
      expect(evaluateCondition({ field: 'generation_mode', op: 'eq', value: 'text_only' }, values)).toBe(false);
    });

    it('neq: 不等于', () => {
      expect(evaluateCondition({ field: 'generation_mode', op: 'neq', value: 'text_only' }, values)).toBe(true);
      expect(evaluateCondition({ field: 'generation_mode', op: 'neq', value: 'first_last_frame' }, values)).toBe(false);
    });

    it('in: 值在数组中', () => {
      expect(evaluateCondition({ field: 'generation_mode', op: 'in', value: ['first_frame', 'first_last_frame'] }, values)).toBe(true);
      expect(evaluateCondition({ field: 'generation_mode', op: 'in', value: ['text_only', 'reference'] }, values)).toBe(false);
    });

    it('nin: 值不在数组中', () => {
      expect(evaluateCondition({ field: 'generation_mode', op: 'nin', value: ['text_only'] }, values)).toBe(true);
      expect(evaluateCondition({ field: 'generation_mode', op: 'nin', value: ['first_last_frame'] }, values)).toBe(false);
    });

    it('gt / lt / gte / lte: 数值比较', () => {
      expect(evaluateCondition({ field: 'count', op: 'gt', value: 3 }, values)).toBe(true);
      expect(evaluateCondition({ field: 'count', op: 'gt', value: 5 }, values)).toBe(false);
      expect(evaluateCondition({ field: 'count', op: 'gte', value: 5 }, values)).toBe(true);
      expect(evaluateCondition({ field: 'count', op: 'lt', value: 10 }, values)).toBe(true);
      expect(evaluateCondition({ field: 'count', op: 'lte', value: 5 }, values)).toBe(true);
    });

    it('对非数值字段进行数值比较返回 false', () => {
      expect(evaluateCondition({ field: 'generation_mode', op: 'gt', value: 3 }, values)).toBe(false);
    });

    it('字段不存在时返回 false（eq 除外，undefined === undefined）', () => {
      expect(evaluateCondition({ field: 'nonexistent', op: 'eq', value: undefined }, values)).toBe(true);
      expect(evaluateCondition({ field: 'nonexistent', op: 'eq', value: 'something' }, values)).toBe(false);
    });
  });

  describe('逻辑组合', () => {
    it('and: 全部满足', () => {
      expect(evaluateCondition({
        and: [
          { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
          { field: 'count', op: 'gt', value: 3 },
        ],
      }, values)).toBe(true);

      expect(evaluateCondition({
        and: [
          { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
          { field: 'count', op: 'gt', value: 10 },
        ],
      }, values)).toBe(false);
    });

    it('or: 任一满足', () => {
      expect(evaluateCondition({
        or: [
          { field: 'generation_mode', op: 'eq', value: 'text_only' },
          { field: 'count', op: 'gt', value: 3 },
        ],
      }, values)).toBe(true);

      expect(evaluateCondition({
        or: [
          { field: 'generation_mode', op: 'eq', value: 'text_only' },
          { field: 'count', op: 'gt', value: 100 },
        ],
      }, values)).toBe(false);
    });

    it('not: 取反', () => {
      expect(evaluateCondition({
        not: { field: 'generation_mode', op: 'eq', value: 'text_only' },
      }, values)).toBe(true);

      expect(evaluateCondition({
        not: { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
      }, values)).toBe(false);
    });

    it('嵌套组合', () => {
      expect(evaluateCondition({
        and: [
          { or: [
            { field: 'generation_mode', op: 'eq', value: 'first_frame' },
            { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
          ]},
          { not: { field: 'count', op: 'lt', value: 3 } },
        ],
      }, values)).toBe(true);
    });
  });
});
