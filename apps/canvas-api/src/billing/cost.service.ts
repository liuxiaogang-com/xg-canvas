import { Injectable } from '@nestjs/common';

import { AccountModelsClient } from '../account-client';
import {
  normalizeCatalogPricing,
  parseCatalogPricing,
  type CatalogPricing,
} from '@xgcanvas/model-catalog';

/** Computes cost exclusively from the immutable Rate Card revision pinned by a request. */
@Injectable()
export class CostService {
  constructor(private readonly models: AccountModelsClient) {}

  async computeCost(
    rateCardRevisionId: string | null | undefined,
    usage: Record<string, unknown> | null | undefined,
  ): Promise<{ cost: number; currency: string } | null> {
    if (!rateCardRevisionId) return null;
    const raw = await this.models.getRateCardPricing(rateCardRevisionId);
    if (!raw) return null;
    let parsed: CatalogPricing;
    try {
      parsed = parseCatalogPricing(raw);
    } catch (error) {
      throw new Error(
        `invalid pinned Rate Card pricing ${rateCardRevisionId}: ${(error as Error).message}`,
      );
    }
    const pricing = normalizeCatalogPricing(
      parsed,
      typeof usage?.billing_tier === 'string' ? usage.billing_tier : undefined,
    );

    let cost = 0;
    let matched = false;
    for (const component of pricing.components) {
      const quantity = component.meter === 'requests' ? 1 : Number(usage?.[component.meter]);
      if (!Number.isFinite(quantity) || quantity <= 0 || component.per <= 0) continue;
      cost += (quantity / component.per) * component.price;
      matched = true;
    }
    return matched ? { cost, currency: pricing.currency } : null;
  }
}
