import { MODULE_METADATA } from '@nestjs/common/constants';

import { AccountModule } from './account.module';

type ModuleLike = { module?: unknown } | ((...args: never[]) => unknown);

describe('AccountModule graph', () => {
  it('contains no undefined module imports', () => {
    const visited = new Set<unknown>();

    const visit = (candidate: unknown, path: string): void => {
      expect(candidate).toBeDefined();
      if (!candidate) return;

      const moduleType =
        typeof candidate === 'object' && 'module' in candidate
          ? (candidate as ModuleLike & { module: unknown }).module
          : candidate;
      if (typeof moduleType !== 'function' || visited.has(moduleType)) return;
      visited.add(moduleType);

      const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleType) ?? []) as unknown[];
      imports.forEach((imported, index) =>
        visit(imported, `${path} -> ${moduleType.name}[${index}]`),
      );
    };

    visit(AccountModule, 'AccountModule');
    expect(visited.size).toBeGreaterThan(1);
  });
});
