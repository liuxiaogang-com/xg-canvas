import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ModelDefinition } from '../account/model-definition/model-definition.entity';

interface PricingComponent {
  meter: string;
  per: number;
  price: number;
}
interface ModelPricing {
  currency: string;
  components: PricingComponent[];
}

/** Raw pricing as stored in model_definitions.pricing — either the component form
 *  (DeepSeek-style) or a flat unit form (token / second / image, OpenAI/Doubao-style). */
interface RawPricing {
  currency?: string;
  components?: PricingComponent[];
  unit?: 'token' | 'second' | 'image' | 'request' | string;
  input_price_per_1k?: number;
  output_price_per_1k?: number;
  cached_input_price_per_1k?: number;
  price_per_second?: number;
  price_per_image?: number;
  standard_price?: number;
  price_per_request?: number;
}

/**
 * Normalize either pricing shape into canonical native-meter components. This is what lets
 * a token model and a per-second video model bill correctly side by side (the "有的按 token
 * 有的按秒" case) — each unit becomes a {meter, per, price} the usage meters map onto.
 */
function normalizePricing(raw: RawPricing | null | undefined): ModelPricing | null {
  if (!raw) return null;
  const currency = raw.currency || 'USD';
  if (Array.isArray(raw.components) && raw.components.length) {
    return { currency, components: raw.components };
  }
  const components: PricingComponent[] = [];
  const push = (meter: string, per: number, price: unknown) => {
    if (typeof price === 'number' && price > 0) components.push({ meter, per, price });
  };
  switch (raw.unit) {
    case 'second':
      push('seconds', 1, raw.price_per_second);
      break;
    case 'image':
      push('images', 1, raw.price_per_image ?? raw.standard_price);
      break;
    case 'request':
      push('requests', 1, raw.price_per_request);
      break;
    case 'token':
    default:
      push('input_tokens', 1000, raw.input_price_per_1k);
      push('output_tokens', 1000, raw.output_price_per_1k);
      push('cached_input_tokens', 1000, raw.cached_input_price_per_1k);
      break;
  }
  return components.length ? { currency, components } : null;
}

/**
 * Computes a request's cost from its NATIVE usage meters × the model's rate card
 * (account.model_definitions.pricing). Meters stay native — input_tokens / output_tokens /
 * seconds / images — so a token model and a per-second model bill correctly without any
 * forced unit conversion. Cost is in the model's own currency.
 *
 * Pricing is cached per process (rarely changes); call invalidate() after a config-sync
 * or a model edit. A lookup miss triggers one lazy refresh so newly-imported models
 * become billable without a restart.
 */
@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);
  private cache: Map<string, ModelPricing> | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshedAt = 0;
  private static readonly TTL_MS = 60_000;

  constructor(
    @InjectRepository(ModelDefinition) private readonly modelRepo: Repository<ModelDefinition>,
  ) {}

  /** Frozen cost for a request, or null when the model has no rate card / no usage. */
  async computeCost(
    modelId: string | null | undefined,
    usage: Record<string, unknown> | null | undefined,
  ): Promise<{ cost: number; currency: string } | null> {
    if (!modelId || !usage) return null;
    const pricing = await this.pricingFor(modelId);
    if (!pricing || !pricing.components?.length) return null;
    let cost = 0;
    for (const comp of pricing.components) {
      // A per-request flat charge bills one unit even when the usage object omits it.
      const qty = comp.meter === 'requests' ? 1 : Number(usage[comp.meter]);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!comp.per || comp.per <= 0) continue;
      cost += (qty / comp.per) * comp.price;
    }
    return { cost, currency: pricing.currency || 'USD' };
  }

  /** Drop the cached rate cards (after pricing changes). */
  invalidate(): void {
    this.cache = null;
    this.refreshedAt = 0;
  }

  private async pricingFor(modelId: string): Promise<ModelPricing | null> {
    if (!this.cache) await this.refresh();
    let hit = this.cache?.get(modelId) ?? null;
    if (!hit && Date.now() - this.refreshedAt > CostService.TTL_MS) {
      // Possibly a newly-imported model — refresh at most once per TTL, then retry.
      await this.refresh();
      hit = this.cache?.get(modelId) ?? null;
    }
    return hit;
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const map = new Map<string, ModelPricing>();
      try {
        const rows = await this.modelRepo.find();
        for (const r of rows) {
          const p = normalizePricing(r.pricing as RawPricing | null);
          if (p) map.set(r.model_id, p);
        }
      } catch (e) {
        this.logger.warn(`pricing refresh failed: ${(e as Error).message}`);
      }
      this.cache = map;
      this.refreshedAt = Date.now();
      this.refreshing = null;
    })();
    return this.refreshing;
  }
}
