import type {
  ConditionExpr,
  ModelParamSchema,
  ParamConstraint,
} from '@xgcanvas/constraint-engine';
import { z } from 'zod';

const PARAM_TYPES = [
  'string', 'number', 'integer', 'boolean', 'enum', 'multi_enum', 'file', 'file_list',
  'text', 'color', 'slider', 'aspect_ratio',
] as const;
const COMPARISON_OPS = ['eq', 'neq', 'in', 'nin', 'gt', 'lt', 'gte', 'lte'] as const;
const UI_ZONES = ['reference', 'main_input', 'model_selector', 'params', 'advanced'] as const;

export const ConditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() => z.union([
  z.object({ field: z.string().min(1), op: z.enum(COMPARISON_OPS), value: z.unknown() }).strict(),
  z.object({ and: z.array(ConditionExprSchema).min(1) }).strict(),
  z.object({ or: z.array(ConditionExprSchema).min(1) }).strict(),
  z.object({ not: ConditionExprSchema }).strict(),
])) as z.ZodType<ConditionExpr>;

const EnumOptionSchema = z.object({
  value: z.union([z.string(), z.number()]),
  label: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  disabled: z.boolean().optional(),
  disabled_reason: z.string().optional(),
}).strict();

const ParamDefinitionSchema = z.object({
  type: z.enum(PARAM_TYPES),
  label: z.string().min(1),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  default: z.unknown().optional(),
  enum_options: z.array(EnumOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  min_length: z.number().int().nonnegative().optional(),
  max_length: z.number().int().nonnegative().optional(),
  pattern: z.string().optional(),
  accept: z.array(z.string().min(1)).optional(),
  max_file_size_mb: z.number().positive().optional(),
  max_file_count: z.number().int().positive().optional(),
  ui_component: z.string().optional(),
  ui_width: z.enum(['full', 'half', 'third']).optional(),
  ui_hidden: z.boolean().optional(),
  tooltip: z.string().optional(),
  visible_when: ConditionExprSchema.optional(),
  is_provider_param: z.boolean().optional(),
}).strict();

const ParamGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  fields: z.array(z.string().min(1)),
  description: z.string().optional(),
  collapsed: z.boolean().optional(),
  ui_zone: z.enum(UI_ZONES).optional(),
}).strict();

export const ModelParamSchemaSchema: z.ZodType<ModelParamSchema> = z.object({
  version: z.literal('1.0'),
  groups: z.array(ParamGroupSchema),
  properties: z.record(ParamDefinitionSchema),
  required: z.array(z.string().min(1)),
  defaults: z.record(z.unknown()),
}).strict() as z.ZodType<ModelParamSchema>;

const TargetSchema = z.object({ target: z.string().min(1) });
const ConstraintActionSchema = z.discriminatedUnion('type', [
  TargetSchema.extend({ type: z.literal('restrict_options'), allowed_values: z.array(z.unknown()) }).strict(),
  TargetSchema.extend({ type: z.literal('set_value'), value: z.unknown() }).strict(),
  TargetSchema.extend({ type: z.literal('set_range'), min: z.number().optional(), max: z.number().optional() }).strict(),
  TargetSchema.extend({ type: z.literal('disable'), reason: z.string().optional() }).strict(),
  TargetSchema.extend({ type: z.literal('show') }).strict(),
  TargetSchema.extend({ type: z.literal('hide') }).strict(),
  TargetSchema.extend({ type: z.literal('set_required'), required: z.boolean() }).strict(),
]);

export const ParamConstraintSchema: z.ZodType<ParamConstraint> = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  when: ConditionExprSchema,
  actions: z.array(ConstraintActionSchema).min(1),
}).strict() as z.ZodType<ParamConstraint>;

export interface ParsedParamContract {
  schema: ModelParamSchema;
  constraints: ParamConstraint[];
}

export function assertValidParamContract(
  schema: unknown,
  constraints: unknown,
): ParsedParamContract {
  const parsedSchema = ModelParamSchemaSchema.parse(schema);
  const parsedConstraints = z.array(ParamConstraintSchema).parse(constraints);
  const fields = new Set(Object.keys(parsedSchema.properties));
  const issues: string[] = [];
  const groupIds = new Set<string>();
  for (const group of parsedSchema.groups) {
    if (groupIds.has(group.id)) issues.push(`duplicate group id "${group.id}"`);
    groupIds.add(group.id);
    for (const field of group.fields) requireField(fields, field, `group ${group.id}`, issues);
  }
  for (const field of parsedSchema.required) requireField(fields, field, 'required', issues);
  for (const field of Object.keys(parsedSchema.defaults)) requireField(fields, field, 'defaults', issues);
  for (const [field, definition] of Object.entries(parsedSchema.properties)) {
    if (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max) {
      issues.push(`property ${field} has min greater than max`);
    }
    if (
      definition.min_length !== undefined && definition.max_length !== undefined &&
      definition.min_length > definition.max_length
    ) issues.push(`property ${field} has min_length greater than max_length`);
    if (definition.visible_when) collectConditionFields(definition.visible_when, fields, issues);
  }
  const constraintIds = new Set<string>();
  for (const constraint of parsedConstraints) {
    if (constraintIds.has(constraint.id)) issues.push(`duplicate constraint id "${constraint.id}"`);
    constraintIds.add(constraint.id);
    collectConditionFields(constraint.when, fields, issues);
    for (const action of constraint.actions) {
      requireField(fields, action.target, `constraint ${constraint.id}`, issues);
      if (
        action.type === 'set_range' && action.min !== undefined && action.max !== undefined &&
        action.min > action.max
      ) issues.push(`constraint ${constraint.id} has min greater than max`);
    }
  }
  if (issues.length > 0) throw new Error(`invalid parameter contract: ${issues.join('; ')}`);
  return { schema: parsedSchema, constraints: parsedConstraints };
}

function collectConditionFields(
  condition: ConditionExpr,
  fields: ReadonlySet<string>,
  issues: string[],
): void {
  if ('field' in condition) requireField(fields, condition.field, 'condition', issues);
  else if ('and' in condition) condition.and.forEach((item) => collectConditionFields(item, fields, issues));
  else if ('or' in condition) condition.or.forEach((item) => collectConditionFields(item, fields, issues));
  else collectConditionFields(condition.not, fields, issues);
}

function requireField(
  fields: ReadonlySet<string>,
  field: string,
  owner: string,
  issues: string[],
): void {
  if (!fields.has(field)) issues.push(`${owner} references unknown field "${field}"`);
}
