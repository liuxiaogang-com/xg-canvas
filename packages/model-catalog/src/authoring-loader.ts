import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Dirent } from 'node:fs';
import * as yaml from 'js-yaml';
import { compileCatalog } from './compiler';
import {
  CatalogReleaseAuthoringSchema,
  ProviderAuthoringDocumentSchema,
} from './schema';
import type {
  CatalogCompilation,
  CatalogCompilerInput,
  CatalogCompilerOptions,
  ProviderAuthoringDocument,
} from './types';
import { compareCodeUnits } from './canonical';

export const MAX_CATALOG_AUTHORING_FILE_LINES = 200;

export interface CatalogDirectoryOptions extends CatalogCompilerOptions {
  release_file?: string;
}

export async function compileCatalogDirectory(
  configRoot: string,
  options: CatalogDirectoryOptions = {},
): Promise<CatalogCompilation> {
  const input = await loadCatalogAuthoring(configRoot, options.release_file);
  return compileCatalog(input, options);
}

export async function loadCatalogAuthoring(
  configRoot: string,
  releaseFile = 'model-catalog.yaml',
): Promise<CatalogCompilerInput> {
  const releasePath = path.resolve(configRoot, releaseFile);
  const releaseRaw = await readYaml(releasePath);
  const releaseResult = CatalogReleaseAuthoringSchema.safeParse(releaseRaw);
  if (!releaseResult.success) {
    throw new Error(formatZodError(releasePath, releaseResult.error.errors));
  }

  const templates = await loadSchemaTemplates(path.join(configRoot, 'schema-templates'));
  const providerRoot = path.join(configRoot, 'model-providers');
  const providerFiles = await listYamlFiles(providerRoot);
  const documents: ProviderAuthoringDocument[] = [];
  for (const filePath of providerFiles) {
    const raw = await readYaml(filePath);
    if (isTemplateDocument(raw)) {
      const providerSlug = providerSlugFromProfilePath(providerRoot, filePath);
      const key = providerSlug ? `${providerSlug}/${raw.template_id}` : raw.template_id;
      if (templates.has(key)) throw new Error(`${filePath}: duplicate template_id "${key}"`);
      templates.set(key, raw.schema);
      continue;
    }
    const parsed = ProviderAuthoringDocumentSchema.safeParse(raw);
    if (!parsed.success) throw new Error(formatZodError(filePath, parsed.error.errors));
    documents.push({ ...parsed.data, file_path: normalizeRelative(configRoot, filePath) });
  }

  return { release: releaseResult.data, documents, templates };
}

export async function loadSchemaTemplates(dir: string): Promise<Map<string, unknown>> {
  const templates = new Map<string, unknown>();
  for (const filePath of await listYamlFiles(dir, true)) {
    const raw = await readYaml(filePath);
    if (!isTemplateDocument(raw)) {
      throw new Error(`${filePath}: template file must contain template_id and schema`);
    }
    if (templates.has(raw.template_id)) {
      throw new Error(`${filePath}: duplicate template_id "${raw.template_id}"`);
    }
    templates.set(raw.template_id, raw.schema);
  }
  return templates;
}

async function listYamlFiles(dir: string, allowMissing = false): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (allowMissing && isMissing(error)) return [];
    throw error;
  }
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => compareCodeUnits(a.name, b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listYamlFiles(fullPath));
    else if (/\.ya?ml$/i.test(entry.name)) out.push(fullPath);
  }
  return out;
}

async function readYaml(filePath: string): Promise<unknown> {
  const text = await fs.readFile(filePath, 'utf8');
  assertCatalogAuthoringFileSize(filePath, text);
  try {
    return yaml.load(text);
  } catch (error) {
    throw new Error(`${filePath}: invalid YAML: ${(error as Error).message}`);
  }
}

export function assertCatalogAuthoringFileSize(filePath: string, text: string): void {
  const normalized = text.replace(/\r\n/g, '\n');
  const lineCount = normalized.length === 0
    ? 0
    : normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0);
  if (lineCount > MAX_CATALOG_AUTHORING_FILE_LINES) {
    throw new Error(
      `${filePath}: ${lineCount} lines exceeds the Catalog authoring limit ` +
      `${MAX_CATALOG_AUTHORING_FILE_LINES}; split it by model family or input mode`,
    );
  }
}

function isTemplateDocument(value: unknown): value is { template_id: string; schema: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'template_id' in value &&
    typeof value.template_id === 'string' &&
    'schema' in value
  );
}

function providerSlugFromProfilePath(providerRoot: string, filePath: string): string | undefined {
  const relative = normalizeRelative(providerRoot, filePath);
  const parts = relative.split('/');
  const profileIndex = parts.indexOf('profiles');
  return profileIndex === 1 ? parts[0] : undefined;
}

function normalizeRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function formatZodError(
  filePath: string,
  errors: readonly { path: (string | number)[]; message: string }[],
): string {
  return `${filePath}: ${errors.map((error) => `${error.path.join('.') || 'document'}: ${error.message}`).join('; ')}`;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
