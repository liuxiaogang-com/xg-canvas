import { accessSync } from 'node:fs';
import * as path from 'node:path';

export function resolveConfigRoot(envOverride?: string): string {
  if (envOverride) return path.resolve(envOverride);
  let directory = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (exists(path.join(directory, 'pnpm-workspace.yaml'))) {
      return path.join(directory, 'config');
    }
    directory = path.dirname(directory);
  }
  return path.resolve(process.cwd(), 'config');
}

function exists(filePath: string): boolean {
  try {
    accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
