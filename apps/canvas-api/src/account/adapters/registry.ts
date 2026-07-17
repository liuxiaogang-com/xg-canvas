import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ProviderAdapter } from '@xgcanvas/adapters-contract';
import { BUILTIN_ADAPTER_KEYS, type BuiltinAdapterKey } from '@xgcanvas/shared-types';

import { OpenAICompatAdapter } from './openai-compat/adapter';
import { BailianDashscopeAdapter } from './bailian-dashscope/adapter';
import { DreaminaCliAdapter } from './dreamina-cli/adapter';
import { DreaminaCliRunner } from '../dreamina/dreamina-cli.runner';
import { ObjectStorageClient } from '../storage/object-storage.client';

/**
 * In-memory adapter registry. Module-level Nest service so registry-bootstrap
 * (S1.4) can resolve `adapter_key` to a live adapter instance.
 *
 * To add a new adapter: instantiate it in onModuleInit() and call register().
 */
@Injectable()
export class AdapterRegistry implements OnModuleInit {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor(
    @Inject(DreaminaCliRunner) private readonly runner: DreaminaCliRunner,
    private readonly storage: ObjectStorageClient,
  ) {}

  onModuleInit(): void {
    const factories: Record<BuiltinAdapterKey, () => ProviderAdapter> = {
      'openai-compat': () => new OpenAICompatAdapter(),
      'bailian-dashscope': () => new BailianDashscopeAdapter(),
      'dreamina-cli': () => new DreaminaCliAdapter(this.runner, this.storage),
    };
    for (const key of BUILTIN_ADAPTER_KEYS) {
      const adapter = factories[key]();
      if (adapter.key !== key) throw new Error(`adapter factory key mismatch: ${key}`);
      this.register(adapter);
    }
  }

  register(a: ProviderAdapter): void {
    if (this.adapters.has(a.key)) {
      throw new Error(`duplicate adapter key: ${a.key}`);
    }
    this.adapters.set(a.key, a);
  }

  get(key: string): ProviderAdapter {
    const a = this.adapters.get(key);
    if (!a) throw new Error(`adapter not found: ${key}`);
    return a;
  }

  has(key: string): boolean {
    return this.adapters.has(key);
  }

  list(): readonly ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}
