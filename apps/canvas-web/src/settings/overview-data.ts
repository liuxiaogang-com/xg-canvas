import type { ModelDefinition, Provider, StatsOverview } from './types';

export interface SettingsOverviewData {
  stats: StatsOverview | null;
  providerCount: number | null;
  modelCount: number | null;
}

export interface SettingsOverviewAccess {
  canManageModels: boolean;
  canViewBilling: boolean;
}

export interface SettingsOverviewLoaders {
  stats(): Promise<StatsOverview>;
  providers(): Promise<Provider[]>;
  models(): Promise<ModelDefinition[]>;
}

export async function loadSettingsOverview(
  access: SettingsOverviewAccess,
  loaders: SettingsOverviewLoaders,
): Promise<SettingsOverviewData> {
  const statsPromise = access.canViewBilling
    ? loaders.stats()
    : Promise.resolve<StatsOverview | null>(null);

  if (!access.canManageModels) {
    return {
      stats: await statsPromise,
      providerCount: null,
      modelCount: null,
    };
  }

  const [stats, providers, models] = await Promise.all([
    statsPromise,
    loaders.providers(),
    loaders.models(),
  ]);
  return {
    stats,
    providerCount: providers.length,
    modelCount: models.length,
  };
}
