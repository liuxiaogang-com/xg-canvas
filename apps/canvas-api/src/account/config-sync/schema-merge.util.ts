import { Logger } from '@nestjs/common';

/**
 * 解析 param_schema，处理 extends 模板继承 (extracted from config-sync.service.ts).
 * 若包含 extends 字段，则加载模板并合并 override。
 * 若无 extends 且为 flat 格式（{field: {kind: ...}}），自动转换为
 * constraint-engine 的标准格式（{properties: {field: {type: ...}}}）。
 */
export function resolveParamSchema(
  schemaConfig: any,
  templateCache: Map<string, any>,
  logger?: Logger,
): any {
  if (!schemaConfig) return {};
  if (!schemaConfig.extends) return ensureStandardSchema(schemaConfig);

  const templateRef = schemaConfig.extends.replace('templates/', '');
  const template = templateCache.get(templateRef);

  if (!template) {
    logger?.warn(`模板 ${templateRef} 未找到，使用 override 作为完整 Schema`);
    return schemaConfig.override || {};
  }

  return deepMergeSchema(template, schemaConfig.override || {});
}

/**
 * 深度合并 Schema：override 中的 groups 和 properties 替换模板中的同名项。
 */
export function deepMergeSchema(template: any, override: any): any {
  const result = { ...template };

  // groups: override 完全替换（groups 定义字段顺序和分组，局部覆盖会混乱）
  if (override.groups) {
    result.groups = override.groups;
  }

  // properties: 逐字段合并
  if (override.properties) {
    result.properties = { ...template.properties };
    for (const [key, value] of Object.entries(override.properties)) {
      result.properties[key] = value;
    }
  }

  if (override.required) {
    result.required = override.required;
  }
  if (override.defaults) {
    result.defaults = { ...template.defaults, ...override.defaults };
  }

  return result;
}

/** 允许的 zone → group 映射（flat 格式中的 zone 对应 UI 中的区域） */
const ZONE_GROUP_LABEL: Record<string, string> = {
  center: '主要输入',
  top: '参考素材',
  bottom: '参数选项',
};

/**
 * 将 flat YAML 格式的 param_schema（{field: {kind: ..., ...}}）转换为
 * constraint-engine 标准格式（{version, groups, properties, required, defaults}）。
 *
 * flat 格式示例：
 *   prompt: { kind: text, required: true, zone: center }
 *   ratio:  { kind: enum, values: ["1:1","16:9"], default: "1:1", zone: bottom }
 *
 * kind → type 映射：
 *   text → text, enum → enum, number → number,
 *   range → number, image → file, image_list → file_list
 */
function convertFlatSchema(flat: Record<string, any>): any {
  const fields = Object.keys(flat);
  const properties: Record<string, any> = {};
  const required: string[] = [];
  const defaults: Record<string, any> = {};
  const zoneFields = new Map<string, string[]>();

  for (const field of fields) {
    const def = flat[field] ?? {};
    const kind: string = def.kind ?? 'text';
    const prop: Record<string, any> = {
      type: mapKindToType(kind),
      label: def.label ?? field,
    };

    if (def.description) prop.description = def.description;
    if (def.placeholder) prop.placeholder = def.placeholder;

    // enum → enum_options
    if (kind === 'enum' && Array.isArray(def.values)) {
      prop.enum_options = def.values.map((v: any) =>
        typeof v === 'object' ? v : { value: v, label: String(v) },
      );
    }

    // numeric / range constraints
    if (def.min !== undefined) prop.min = def.min;
    if (def.max !== undefined) prop.max = def.max;
    if (def.step !== undefined) prop.step = def.step;
    if (def.min_length !== undefined) prop.min_length = def.min_length;
    if (def.max_length !== undefined) prop.max_length = def.max_length;

    // file constraints
    if (kind === 'image' || kind === 'image_list') {
      prop.accept = def.accept ?? ['image/png', 'image/jpeg', 'image/webp'];
    }
    if (def.max_file_size_mb) prop.max_file_size_mb = def.max_file_size_mb;
    if (def.max_file_count !== undefined || (kind === 'image_list' && def.max)) {
      prop.max_file_count = def.max_file_count ?? def.max;
    }

    if (def.required) required.push(field);
    if (def.default !== undefined) defaults[field] = def.default;

    // zone → group
    const zone = def.zone ?? 'bottom';
    if (!zoneFields.has(zone)) zoneFields.set(zone, []);
    zoneFields.get(zone)!.push(field);

    properties[field] = prop;
  }

  // build groups from zone ordering
  const zoneOrder = ['top', 'center', 'bottom'];
  const groups: any[] = [];
  for (const z of zoneOrder) {
    const fs = zoneFields.get(z);
    if (fs && fs.length > 0) {
      groups.push({
        id: z,
        label: ZONE_GROUP_LABEL[z] ?? z,
        fields: fs,
        ui_zone: z === 'center' ? 'main_input' : z === 'top' ? 'reference' : 'params',
      });
    }
  }

  return {
    version: '1.0',
    groups,
    properties,
    required,
    defaults,
  };
}

/**
 * 检测 schemaConfig 是否为 flat 格式（{field: {kind: ...}}），若是则转换为标准格式。
 * 供 config-sync 和 registry yaml-loader 共用。
 */
export function ensureStandardSchema(schemaConfig: any): any {
  if (!schemaConfig || typeof schemaConfig !== 'object') return {};
  // already standard format (has version + properties)
  if (schemaConfig.version && schemaConfig.properties) return schemaConfig;
  // extends format — let the caller handle template resolution
  if (schemaConfig.extends) return schemaConfig;
  return convertFlatSchema(schemaConfig);
}

/** flat 格式的 kind → constraint-engine ParamType */
function mapKindToType(kind: string): string {
  switch (kind) {
    case 'text': return 'text';
    case 'enum': return 'enum';
    case 'boolean': return 'boolean';
    case 'integer': return 'integer';
    case 'number': return 'number';
    case 'range': return 'number';
    case 'image': return 'file';
    case 'image_list': return 'file_list';
    default: return 'string';
  }
}
