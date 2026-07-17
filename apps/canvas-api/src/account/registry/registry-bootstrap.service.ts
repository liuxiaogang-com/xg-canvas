import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadCatalogBundle } from '@xgcanvas/model-catalog';
import * as path from 'node:path';
import { DataSource, type EntityManager } from 'typeorm';
import { AdapterRegistry } from '../adapters/registry';
import { CatalogRuntimeState } from '../catalog/catalog.entities';
import { CatalogImportService } from '../catalog/catalog-import.service';
import { resolveConfigRoot } from '../catalog/config-root';
import { RedisKeys, RedisService } from '../redis';
import { RegistryService } from './registry.service';
import { RegistrySnapshotFactory } from './registry-snapshot.factory';
import type { ReloadReport } from './types';

@Injectable()
export class RegistryBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RegistryBootstrapService.name);
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly adapters: AdapterRegistry,
    private readonly catalogImport: CatalogImportService,
    private readonly snapshotFactory: RegistrySnapshotFactory,
    private readonly registry: RegistryService,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('REGISTRY_AUTOLOAD') === 'false') {
      this.logger.log('REGISTRY_AUTOLOAD=false — skipping bootstrap');
      return;
    }
    const report = await this.reload();
    this.logger.log(
      `catalog registry loaded: ${report.loaded} models, epoch ${report.catalog_epoch}`,
    );
  }

  reload(): Promise<ReloadReport> {
    return this.enqueue(() => this.performReload());
  }

  mutateLocal<T>(mutation: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const outcome = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtext('xgcanvas:catalog-activation'))",
        );
        await manager.query('SELECT id FROM account.catalog_runtime_state WHERE id = 1 FOR UPDATE');
        const value = await mutation(manager);
        const candidate = await this.snapshotFactory.build(manager);
        const stateRepo = manager.getRepository(CatalogRuntimeState);
        const state = await stateRepo.findOneByOrFail({ id: 1 });
        state.catalog_epoch = (BigInt(state.catalog_epoch) + 1n).toString();
        state.snapshot_digest = candidate.content_digest;
        await stateRepo.save(state);
        return { value, candidate, catalogEpoch: String(state.catalog_epoch) };
      });
      const snapshot = this.snapshotFactory.withCatalogEpoch(
        outcome.candidate,
        outcome.catalogEpoch,
      );
      this.registry.setSnapshot(snapshot);
      await this.cacheRevision(snapshot.byId.size, snapshot.catalog_epoch, snapshot.content_digest);
      return outcome.value;
    });
  }

  private async performReload(): Promise<ReloadReport> {
    const { bundlePath, compilation } = await this.loadCompilation();

    const outcome = await this.catalogImport.activateOfficialWithCandidate(
      compilation,
      async (manager) => {
        const snapshot = await this.snapshotFactory.build(manager);
        return { value: snapshot, content_digest: snapshot.content_digest };
      },
    );
    const snapshot = this.snapshotFactory.withCatalogEpoch(
      outcome.candidate,
      String(outcome.result.catalog_epoch),
    );
    this.registry.setSnapshot(snapshot);
    await this.cacheRevision(snapshot.byId.size, snapshot.catalog_epoch, snapshot.content_digest);
    return {
      loaded: snapshot.byId.size,
      files: [bundlePath],
      errors: outcome.result.errors,
      release_id: outcome.result.release_id,
      catalog_epoch: snapshot.catalog_epoch,
      content_digest: snapshot.content_digest,
      resources: outcome.result.resources,
    };
  }

  async preview() {
    const { compilation } = await this.loadCompilation();
    return this.catalogImport.previewOfficial(compilation);
  }

  private async loadCompilation() {
    const configRoot = resolveConfigRoot(this.config.get<string>('XGCANVAS_CONFIG_ROOT'));
    const bundlePath = path.join(configRoot, 'model-catalog.bundle.json');
    const adapters = this.adapters.list();
    const knownAdapters = new Set(adapters.map((adapter) => adapter.key));
    const taskTypes = new Map(adapters.map((adapter) => [adapter.key, adapter.capabilities]));
    return {
      bundlePath,
      compilation: await loadCatalogBundle(bundlePath, knownAdapters, taskTypes),
    };
  }

  private async cacheRevision(count: number, epoch: string, digest: string): Promise<void> {
    try {
      await this.redis.set(
        RedisKeys.registry.revision(),
        JSON.stringify({ at: new Date().toISOString(), count, epoch, digest }),
      );
    } catch (error) {
      this.logger.warn(`redis registry metadata write skipped: ${(error as Error).message}`);
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(work, work);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
