import type {
  ModelParamSchema,
  ParamConstraint,
  ConstraintAction,
  FieldState,
  FieldStates,
  EnumOption,
} from './types';
import { evaluateCondition } from './condition';

/**
 * 约束引擎核心函数
 * 根据当前参数值、Schema 和约束规则，计算每个字段的状态
 *
 * 纯函数，前后端共用：
 * - 前端：每次用户修改参数后调用，驱动 UI 联动
 * - 后端：提交时调用，校验参数合法性
 */
export function evaluateConstraints(
  values: Record<string, any>,
  schema: ModelParamSchema,
  constraints: ParamConstraint[]
): FieldStates {
  const states = initFieldStates(schema);

  // 1. 遍历所有约束规则
  for (const constraint of constraints) {
    if (evaluateCondition(constraint.when, values)) {
      for (const action of constraint.actions) {
        applyAction(states, action, schema);
      }
    }
  }

  // 2. 处理 visible_when 条件
  for (const [field, def] of Object.entries(schema.properties)) {
    if (def.visible_when) {
      if (!evaluateCondition(def.visible_when, values)) {
        states[field].visible = false;
      }
    }
  }

  return states;
}

/**
 * 初始化所有字段的默认状态
 */
export function initFieldStates(schema: ModelParamSchema): FieldStates {
  const states: FieldStates = {};

  for (const [field, def] of Object.entries(schema.properties)) {
    states[field] = {
      visible: def.ui_hidden !== true,
      disabled: false,
      required: schema.required.includes(field),
      errors: [],
    };

    // 数值类型：设置有效范围
    if (
      def.type === 'number' ||
      def.type === 'integer' ||
      def.type === 'slider'
    ) {
      if (def.min !== undefined) states[field].effective_min = def.min;
      if (def.max !== undefined) states[field].effective_max = def.max;
    }

    // 枚举类型：设置可选项
    if (
      (def.type === 'enum' || def.type === 'multi_enum') &&
      def.enum_options
    ) {
      states[field].available_options = [...def.enum_options];
    }
  }

  return states;
}

/**
 * 应用单个约束动作
 */
function applyAction(
  states: FieldStates,
  action: ConstraintAction,
  schema: ModelParamSchema
): void {
  const target = action.target;

  // 目标字段不存在则跳过
  if (!states[target]) return;

  switch (action.type) {
    case 'restrict_options': {
      const def = schema.properties[target];
      if (def?.enum_options) {
        states[target].available_options = def.enum_options.filter((opt) =>
          action.allowed_values.includes(opt.value)
        );
      }
      break;
    }

    case 'set_value':
      // set_value 不修改 FieldState，由调用方决定是否应用值变更
      // 这里可通过 errors 或外部回调处理
      break;

    case 'set_range':
      if (action.min !== undefined) {
        states[target].effective_min = action.min;
      }
      if (action.max !== undefined) {
        states[target].effective_max = action.max;
      }
      break;

    case 'disable':
      states[target].disabled = true;
      states[target].disabled_reason = action.reason;
      break;

    case 'show':
      states[target].visible = true;
      break;

    case 'hide':
      states[target].visible = false;
      break;

    case 'set_required':
      states[target].required = action.required;
      break;
  }
}

/**
 * 合并用户参数与默认值
 * 加载已保存的工作流时调用，处理 Schema 变更的向后兼容
 */
export function reconcileParams(
  savedParams: Record<string, any>,
  schema: ModelParamSchema
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, def] of Object.entries(schema.properties)) {
    if (key in savedParams) {
      // 参数还存在：验证值是否合法
      if (isValueValid(savedParams[key], def, schema)) {
        result[key] = savedParams[key];
      } else {
        // 值不再合法（如枚举选项被移除）：回退到默认值
        result[key] = def.default ?? schema.defaults[key];
      }
    } else {
      // 新增参数或未设置过：使用默认值
      const defaultVal = def.default ?? schema.defaults[key];
      if (defaultVal !== undefined) {
        result[key] = defaultVal;
      }
    }
  }

  return result;
}

/**
 * 检查一个值对于给定的参数定义是否合法
 */
function isValueValid(
  value: any,
  def: ModelParamSchema['properties'][string],
  _schema: ModelParamSchema
): boolean {
  if (value === undefined || value === null) return true;

  switch (def.type) {
    case 'enum': {
      if (!def.enum_options) return true;
      return def.enum_options.some((opt) => opt.value === value);
    }

    case 'multi_enum': {
      if (!Array.isArray(value) || !def.enum_options) return true;
      const validValues = def.enum_options.map((opt) => opt.value);
      return value.every((v) => validValues.includes(v));
    }

    case 'number':
    case 'integer':
    case 'slider': {
      if (typeof value !== 'number') return false;
      if (def.min !== undefined && value < def.min) return false;
      if (def.max !== undefined && value > def.max) return false;
      if (def.type === 'integer' && !Number.isInteger(value)) return false;
      return true;
    }

    case 'boolean':
      return typeof value === 'boolean';

    case 'string':
    case 'text':
      return typeof value === 'string';

    default:
      return true;
  }
}
