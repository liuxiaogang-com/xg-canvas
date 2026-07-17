import { Injectable } from '@nestjs/common';
import {
  assertCatalogRuntimeCompatibility,
  type CatalogBundleV1,
  type CatalogCompilation,
} from '@xgcanvas/model-catalog';
import { DataSource, type EntityManager } from 'typeorm';
import { CatalogRelease, CatalogRuntimeState } from './catalog.entities';
import {
  assertCatalogOfficialSource,
  assertCatalogReleaseContinuity,
  effectiveCatalogRelease,
  ensureCatalogInstallations,
  ensureCatalogRelease,
  ensureCatalogSource,
  persistCatalogResources,
} from './catalog-import.persistence';

export interface CatalogActivationResult {
  activated: boolean;
  reason: 'activated' | 'already_active' | 'newer_release_active' | 'dry_run';
  source_id: string;
  release_id: string;
  release_sequence: number;
  content_digest: string;
  catalog_epoch: string;
  resources: {
    providers: number;
    channels: number;
    models: number;
    rate_cards: number;
  };
  errors: string[];
}

export interface CatalogActivationOutcome<T> {
  result: CatalogActivationResult;
  candidate: T;
}

interface PreparedCandidate<T> {
  value: T;
  content_digest: string;
}

type CandidateFinalizer<T> = (
  manager: EntityManager,
  candidate: T,
  catalogEpoch: string,
) => Promise<void>;

@Injectable()
export class CatalogImportService {
  constructor(private readonly dataSource: DataSource) {}

  previewOfficial(compilation: CatalogCompilation): CatalogActivationResult {
    return resultForBundle(compilation.bundle, compilation.content_digest, 'dry_run', '0', false);
  }

  async activateOfficialWithCandidate<T>(
    compilation: CatalogCompilation,
    prepare: (manager: EntityManager) => Promise<PreparedCandidate<T>>,
    finalize?: CandidateFinalizer<T>,
  ): Promise<CatalogActivationOutcome<T>> {
    const { bundle, content_digest: digest } = compilation;
    if (bundle.source.kind !== 'official') {
      throw new Error(`embedded Catalog source must be official, got ${bundle.source.kind}`);
    }

    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('xgcanvas:catalog-activation'))");
      await manager.query('SELECT id FROM account.catalog_runtime_state WHERE id = 1 FOR UPDATE');
      const stateRepo = manager.getRepository(CatalogRuntimeState);
      const state = await stateRepo.findOneByOrFail({ id: 1 });
      const active = state.active_official_release_id
        ? await manager.getRepository(CatalogRelease).findOneBy({
            release_id: state.active_official_release_id,
          })
        : null;
      assertCatalogRuntimeCompatibility(bundle);
      if (active) assertCatalogRuntimeCompatibility(active.bundle);
      assertCatalogOfficialSource(active, bundle);

      const newerActive = Boolean(active && active.sequence > bundle.release.sequence);
      const effective = effectiveCatalogRelease(active, bundle, digest, newerActive);
      if (!newerActive) {
        assertCatalogReleaseContinuity(active, bundle);
        await ensureCatalogSource(manager, bundle);
        await ensureCatalogRelease(manager, bundle, digest);
        await persistCatalogResources(manager, bundle);
        await ensureCatalogInstallations(manager, bundle);
        state.active_official_release_id = bundle.release.release_id;
        await stateRepo.save(state);
      }

      const prepared = await prepare(manager);
      const changed =
        (!newerActive && active?.release_id !== bundle.release.release_id) ||
        state.snapshot_digest !== prepared.content_digest;
      state.snapshot_digest = prepared.content_digest;
      if (changed) state.catalog_epoch = (BigInt(state.catalog_epoch) + 1n).toString();
      await stateRepo.save(state);
      if (finalize) await finalize(manager, prepared.value, String(state.catalog_epoch));

      const reason = newerActive
        ? 'newer_release_active'
        : changed
          ? 'activated'
          : 'already_active';
      return {
        result: resultForBundle(
          effective.bundle,
          effective.digest,
          reason,
          state.catalog_epoch,
          changed,
        ),
        candidate: prepared.value,
      };
    });
  }

  async getRuntimeState(): Promise<CatalogRuntimeState> {
    return this.dataSource.getRepository(CatalogRuntimeState).findOneByOrFail({ id: 1 });
  }
}

function resultForBundle(
  bundle: CatalogBundleV1,
  digest: string,
  reason: CatalogActivationResult['reason'],
  catalogEpoch: string,
  activated: boolean,
): CatalogActivationResult {
  return {
    activated,
    reason,
    source_id: bundle.source.source_id,
    release_id: bundle.release.release_id,
    release_sequence: bundle.release.sequence,
    content_digest: digest,
    catalog_epoch: catalogEpoch,
    resources: {
      providers: bundle.providers.length,
      channels: bundle.channel_templates.length,
      models: bundle.model_offerings.length,
      rate_cards: bundle.rate_cards.length,
    },
    errors: [],
  };
}
