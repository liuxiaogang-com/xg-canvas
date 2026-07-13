import type { QueryRunner } from 'typeorm';

import { ModelChannel } from '../channel/channel.entity';
import { ModelProvider } from '../provider/provider.entity';
import type { ModelConfig } from './config-sync.types';

export async function resolveAllowedChannelIds(
  queryRunner: QueryRunner,
  provider: ModelProvider,
  config: ModelConfig,
): Promise<string[]> {
  const configured = config.allowed_channel_slugs ?? config.allowed_channel_ids;
  if (!configured?.length) return [];
  const ids = configured.filter((x) => isUuid(x));
  const slugs = configured.filter((x) => !isUuid(x));
  if (slugs.length) {
    const rows = await queryRunner.manager.find(ModelChannel, {
      where: slugs.map((slug) => ({ provider_id: provider.id, slug })),
    });
    const found = new Set(rows.map((r) => r.slug));
    const missing = slugs.filter((slug) => !found.has(slug));
    if (missing.length) {
      throw new Error(`model ${config.model_id} references unknown channel slug(s): ${missing.join(', ')}`);
    }
    ids.push(...rows.map((r) => r.id));
  }
  return ids;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
