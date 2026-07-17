#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { compileCatalogDirectory } from './authoring-loader';
import { BUILTIN_ADAPTER_CAPABILITIES } from '@xgcanvas/shared-types';

interface CliOptions {
  configRoot: string;
  outputPath?: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const adapterTaskTypes = new Map(Object.entries(BUILTIN_ADAPTER_CAPABILITIES));
  const compilation = await compileCatalogDirectory(options.configRoot, {
    known_adapter_keys: new Set(adapterTaskTypes.keys()),
    adapter_task_types: adapterTaskTypes,
  });

  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${compilation.canonical_json}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify({
    source_id: compilation.bundle.source.source_id,
    release_id: compilation.bundle.release.release_id,
    release_sequence: compilation.bundle.release.sequence,
    content_digest: compilation.content_digest,
    providers: compilation.bundle.providers.length,
    channel_templates: compilation.bundle.channel_templates.length,
    model_offerings: compilation.bundle.model_offerings.length,
    rate_cards: compilation.bundle.rate_cards.length,
    output: options.outputPath ? path.resolve(options.outputPath) : undefined,
  }, null, 2)}\n`);
}

function parseArgs(args: string[]): CliOptions {
  let configRoot = 'config';
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--config') configRoot = requireValue(args, ++index, arg);
    else if (arg === '--out') outputPath = requireValue(args, ++index, arg);
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: model-catalog [--config <directory>] [--out <bundle.json>]\n');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { configRoot: path.resolve(configRoot), outputPath };
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
