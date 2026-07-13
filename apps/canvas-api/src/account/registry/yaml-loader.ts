import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ensureStandardSchema } from '../config-sync/schema-merge.util';

export interface RawProviderFile {
  filePath: string;
  raw: unknown;
}

export interface RawTemplate {
  name: string;
  raw: unknown;
}

/**
 * Default config root resolution order:
 *   $XGCANVAS_CONFIG_ROOT  > <repo>/config
 * (repo root is found by walking up from this file until package.json with
 *  workspaces is seen, then up one more to the monorepo root.)
 */
export function resolveConfigRoot(envOverride?: string): string {
  if (envOverride) return envOverride;
  // walk up from __dirname to find pnpm-workspace.yaml
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return path.join(dir, 'config');
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), 'config');
}

function existsSync(p: string): boolean {
  try {
    require('node:fs').accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadProviderFiles(rootDir: string): Promise<RawProviderFile[]> {
  const dir = path.join(rootDir, 'model-providers');
  const entries = await safeReaddir(dir);
  const out: RawProviderFile[] = [];
  for (const name of entries) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
    const filePath = path.join(dir, name);
    const text = await fs.readFile(filePath, 'utf8');
    out.push({ filePath, raw: yaml.load(text) });
  }
  return out;
}

export async function loadTemplates(rootDir: string): Promise<Map<string, unknown>> {
  const dir = path.join(rootDir, 'schema-templates');
  const entries = await safeReaddir(dir);
  const map = new Map<string, unknown>();
  for (const name of entries) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue;
    const text = await fs.readFile(path.join(dir, name), 'utf8');
    const parsed = yaml.load(text) as { template_id?: string; schema?: unknown };
    if (parsed?.template_id && parsed.schema) {
      map.set(parsed.template_id, parsed.schema);
    }
  }
  return map;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

export function resolveSchemaWithTemplate(
  schemaConfig: any,
  templates: ReadonlyMap<string, unknown>,
): unknown {
  if (!schemaConfig) return {};
  if (!schemaConfig.extends) return ensureStandardSchema(schemaConfig);
  const tplKey = String(schemaConfig.extends).replace(/^templates\//, '');
  const tpl = templates.get(tplKey);
  if (!tpl) return schemaConfig.override ?? {};
  return deepMerge(tpl as Record<string, any>, schemaConfig.override ?? {});
}

function deepMerge(template: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...template };
  if (override.groups) result.groups = override.groups;
  if (override.properties) {
    result.properties = { ...template.properties, ...override.properties };
  }
  if (override.required) result.required = override.required;
  if (override.defaults) {
    result.defaults = { ...(template.defaults ?? {}), ...override.defaults };
  }
  return result;
}
