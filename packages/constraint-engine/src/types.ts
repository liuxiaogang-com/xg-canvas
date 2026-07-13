// ============================================================
// 模型参数 Schema 类型定义
// 前后端共享，驱动参数面板自动渲染和约束校验
// ============================================================

/** 参数 Schema 根结构 */
export interface ModelParamSchema {
  version: '1.0';
  groups: ParamGroup[];
  properties: Record<string, ParamDefinition>;
  required: string[];
  defaults: Record<string, any>;
}

/** 参数分组，决定 UI 面板的 section 结构 */
export interface ParamGroup {
  id: string;
  label: string;
  fields: string[];
  description?: string;
  collapsed?: boolean;
  ui_zone?: UiZone;
}

export type UiZone =
  | 'reference'
  | 'main_input'
  | 'model_selector'
  | 'params'
  | 'advanced';

/** 参数定义 */
export interface ParamDefinition {
  type: ParamType;
  label: string;
  description?: string;
  placeholder?: string;
  default?: any;

  // 枚举选项
  enum_options?: EnumOption[];

  // 数值约束
  min?: number;
  max?: number;
  step?: number;

  // 字符串约束
  min_length?: number;
  max_length?: number;
  pattern?: string;

  // 文件约束
  accept?: string[];
  max_file_size_mb?: number;
  max_file_count?: number;

  // UI 渲染提示
  ui_component?: string;
  ui_width?: 'full' | 'half' | 'third';
  ui_hidden?: boolean;
  tooltip?: string;

  // 条件显示
  visible_when?: ConditionExpr;

  // 是否透传给厂商
  is_provider_param?: boolean;
}

export type ParamType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'multi_enum'
  | 'file'
  | 'file_list'
  | 'text'
  | 'color'
  | 'slider'
  | 'aspect_ratio';

export interface EnumOption {
  value: string | number;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  disabled_reason?: string;
}

// ============================================================
// 条件表达式
// ============================================================

export type ConditionExpr =
  | ComparisonCondition
  | AndCondition
  | OrCondition
  | NotCondition;

export interface ComparisonCondition {
  field: string;
  op: ComparisonOp;
  value: any;
}

export interface AndCondition {
  and: ConditionExpr[];
}

export interface OrCondition {
  or: ConditionExpr[];
}

export interface NotCondition {
  not: ConditionExpr;
}

export type ComparisonOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte';

// ============================================================
// 参数约束规则
// ============================================================

export interface ParamConstraint {
  id: string;
  description?: string;
  when: ConditionExpr;
  actions: ConstraintAction[];
}

export type ConstraintAction =
  | RestrictOptionsAction
  | SetValueAction
  | SetRangeAction
  | DisableAction
  | ShowAction
  | HideAction
  | SetRequiredAction;

export interface RestrictOptionsAction {
  type: 'restrict_options';
  target: string;
  allowed_values: any[];
}

export interface SetValueAction {
  type: 'set_value';
  target: string;
  value: any;
}

export interface SetRangeAction {
  type: 'set_range';
  target: string;
  min?: number;
  max?: number;
}

export interface DisableAction {
  type: 'disable';
  target: string;
  reason?: string;
}

export interface ShowAction {
  type: 'show';
  target: string;
}

export interface HideAction {
  type: 'hide';
  target: string;
}

export interface SetRequiredAction {
  type: 'set_required';
  target: string;
  required: boolean;
}

// ============================================================
// 约束引擎输出：字段状态
// ============================================================

export interface FieldState {
  visible: boolean;
  disabled: boolean;
  disabled_reason?: string;
  required: boolean;
  /** enum 类型被约束后的可选项（undefined = 不限制） */
  available_options?: EnumOption[];
  /** 数值类型被约束后的有效范围 */
  effective_min?: number;
  effective_max?: number;
  errors: string[];
}

/** 所有字段的状态集合 */
export type FieldStates = Record<string, FieldState>;

// ============================================================
// 校验结果
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** 经约束处理后的有效参数 */
  resolved_params: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
  constraint_id?: string;
}
