/**
 * Tiny DSL on top of @xgcanvas/constraint-engine for use inside YAML loader
 * tests and `defineModel()` callsites that build constraints in code.
 *
 * Most constraints come from YAML; this exists so adapter unit tests can
 * write `when({ field: 'mode', op: 'eq', value: 'fast' }).restrictOptions(...)`
 * without hand-shaping constraint-engine JSON.
 */

import type {
  ComparisonCondition,
  ConditionExpr,
  ConstraintAction,
  ParamConstraint,
} from '@xgcanvas/constraint-engine';

export function eq(field: string, value: unknown): ComparisonCondition {
  return { field, op: 'eq', value };
}

export function neq(field: string, value: unknown): ComparisonCondition {
  return { field, op: 'neq', value };
}

export function inSet(field: string, values: unknown[]): ComparisonCondition {
  return { field, op: 'in', value: values };
}

export function and(...conds: ConditionExpr[]): ConditionExpr {
  return { and: conds };
}

export function or(...conds: ConditionExpr[]): ConditionExpr {
  return { or: conds };
}

export function not(cond: ConditionExpr): ConditionExpr {
  return { not: cond };
}

interface ConstraintDraft {
  id: string;
  description?: string;
  when: ConditionExpr;
  actions: ConstraintAction[];
}

export interface WhenBuilder {
  restrictOptions(target: string, allowed: unknown[]): WhenBuilder;
  setValue(target: string, value: unknown): WhenBuilder;
  setRange(target: string, range: { min?: number; max?: number }): WhenBuilder;
  disable(target: string, reason?: string): WhenBuilder;
  show(target: string): WhenBuilder;
  hide(target: string): WhenBuilder;
  setRequired(target: string, required: boolean): WhenBuilder;
  build(): ParamConstraint;
}

let counter = 0;
function autoId(): string {
  counter += 1;
  return `c_${counter}`;
}

export function when(
  cond: ConditionExpr,
  opts?: { id?: string; description?: string },
): WhenBuilder {
  const draft: ConstraintDraft = {
    id: opts?.id ?? autoId(),
    description: opts?.description,
    when: cond,
    actions: [],
  };
  const builder: WhenBuilder = {
    restrictOptions(target, allowed) {
      draft.actions.push({ type: 'restrict_options', target, allowed_values: allowed });
      return builder;
    },
    setValue(target, value) {
      draft.actions.push({ type: 'set_value', target, value });
      return builder;
    },
    setRange(target, range) {
      draft.actions.push({ type: 'set_range', target, ...range });
      return builder;
    },
    disable(target, reason) {
      draft.actions.push({ type: 'disable', target, reason });
      return builder;
    },
    show(target) {
      draft.actions.push({ type: 'show', target });
      return builder;
    },
    hide(target) {
      draft.actions.push({ type: 'hide', target });
      return builder;
    },
    setRequired(target, required) {
      draft.actions.push({ type: 'set_required', target, required });
      return builder;
    },
    build() {
      return draft;
    },
  };
  return builder;
}
