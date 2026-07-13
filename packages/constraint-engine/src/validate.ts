import type {
  ModelParamSchema,
  ParamConstraint,
  ParamDefinition,
  ValidationResult,
  ValidationError,
  FieldStates,
} from './types';
import { evaluateConstraints } from './engine';

/**
 * 完整参数校验
 * 后端提交前调用，检查参数合法性（含约束规则）
 */
export function validateParams(
  params: Record<string, any>,
  schema: ModelParamSchema,
  constraints: ParamConstraint[]
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. 用默认值填充缺失参数
  const resolved: Record<string, any> = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    if (key in params && params[key] !== undefined && params[key] !== null) {
      resolved[key] = params[key];
    } else if (def.default !== undefined) {
      resolved[key] = def.default;
    } else if (schema.defaults[key] !== undefined) {
      resolved[key] = schema.defaults[key];
    }
  }

  // 2. 计算约束状态
  const fieldStates = evaluateConstraints(resolved, schema, constraints);

  // 3. 逐字段校验
  for (const [field, def] of Object.entries(schema.properties)) {
    const state = fieldStates[field];
    if (!state) continue;

    // 隐藏的字段不校验
    if (!state.visible) continue;

    const value = resolved[field];

    // 必填检查
    if (state.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field,
        message: `${def.label} 为必填项`,
      });
      continue;
    }

    // 值为空且非必填，跳过后续校验
    if (value === undefined || value === null) continue;

    // 类型与范围校验
    const fieldErrors = validateFieldValue(field, value, def, state);
    errors.push(...fieldErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
    resolved_params: resolved,
  };
}

/**
 * 校验单个字段的值
 */
function validateFieldValue(
  field: string,
  value: any,
  def: ParamDefinition,
  state: FieldStates[string]
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (def.type) {
    case 'string':
    case 'text': {
      if (typeof value !== 'string') {
        errors.push({ field, message: `${def.label} 必须是文本` });
        break;
      }
      if (def.min_length !== undefined && value.length < def.min_length) {
        errors.push({ field, message: `${def.label} 至少 ${def.min_length} 个字符` });
      }
      if (def.max_length !== undefined && value.length > def.max_length) {
        errors.push({ field, message: `${def.label} 最多 ${def.max_length} 个字符` });
      }
      if (def.pattern) {
        const regex = new RegExp(def.pattern);
        if (!regex.test(value)) {
          errors.push({ field, message: `${def.label} 格式不正确` });
        }
      }
      break;
    }

    case 'number':
    case 'slider': {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ field, message: `${def.label} 必须是数字` });
        break;
      }
      const min = state.effective_min ?? def.min;
      const max = state.effective_max ?? def.max;
      if (min !== undefined && value < min) {
        errors.push({ field, message: `${def.label} 不能小于 ${min}` });
      }
      if (max !== undefined && value > max) {
        errors.push({ field, message: `${def.label} 不能大于 ${max}` });
      }
      break;
    }

    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push({ field, message: `${def.label} 必须是整数` });
        break;
      }
      const min = state.effective_min ?? def.min;
      const max = state.effective_max ?? def.max;
      if (min !== undefined && value < min) {
        errors.push({ field, message: `${def.label} 不能小于 ${min}` });
      }
      if (max !== undefined && value > max) {
        errors.push({ field, message: `${def.label} 不能大于 ${max}` });
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push({ field, message: `${def.label} 必须是布尔值` });
      }
      break;
    }

    case 'enum': {
      // 使用约束后的可选项（如果有）
      const options = state.available_options ?? def.enum_options;
      if (options && !options.some((opt) => opt.value === value)) {
        errors.push({ field, message: `${def.label} 的值不在可选范围内` });
      }
      break;
    }

    case 'multi_enum': {
      if (!Array.isArray(value)) {
        errors.push({ field, message: `${def.label} 必须是数组` });
        break;
      }
      const options = state.available_options ?? def.enum_options;
      if (options) {
        const validValues = options.map((opt) => opt.value);
        for (const v of value) {
          if (!validValues.includes(v)) {
            errors.push({ field, message: `${def.label} 包含无效选项: ${v}` });
          }
        }
      }
      break;
    }

    case 'file': {
      // 文件类型的值通常是 URL 或 File 对象，这里只做基本检查
      if (typeof value !== 'string' && typeof value !== 'object') {
        errors.push({ field, message: `${def.label} 文件格式无效` });
      }
      break;
    }

    case 'file_list': {
      if (!Array.isArray(value)) {
        errors.push({ field, message: `${def.label} 必须是文件列表` });
        break;
      }
      if (def.max_file_count !== undefined && value.length > def.max_file_count) {
        errors.push({ field, message: `${def.label} 最多 ${def.max_file_count} 个文件` });
      }
      break;
    }
  }

  return errors;
}
