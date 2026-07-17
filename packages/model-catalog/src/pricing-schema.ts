import { z } from 'zod';

export const CATALOG_PRICING_METERS = [
  'input_tokens',
  'output_tokens',
  'cached_input_tokens',
  'duration_seconds',
  'image_count',
  'requests',
] as const;

const CurrencySchema = z.string().min(3).max(8);
const PositivePrice = z.number().finite().positive();

const ComponentPricingSchema = z
  .object({
    meter: z.enum(CATALOG_PRICING_METERS),
    per: z.number().finite().positive(),
    price: PositivePrice,
  })
  .strict();

export const CatalogPricingSchema = z
  .object({
    currency: CurrencySchema,
    components: z.array(ComponentPricingSchema).min(1),
  })
  .strict()
  .superRefine((pricing, context) => {
    const seen = new Set<CatalogPricingMeter>();
    pricing.components.forEach((component, index) => {
      if (seen.has(component.meter)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['components', index, 'meter'],
          message: 'pricing components must not contain duplicate meters',
        });
        return;
      }
      seen.add(component.meter);
    });
  });

export type CatalogPricing = z.infer<typeof CatalogPricingSchema>;
export type CatalogPricingMeter = (typeof CATALOG_PRICING_METERS)[number];

export interface NormalizedCatalogPricing {
  currency: string;
  components: Array<{
    meter: CatalogPricingMeter;
    per: number;
    price: number;
  }>;
}

export function parseCatalogPricing(value: unknown): CatalogPricing {
  return CatalogPricingSchema.parse(value);
}

export function normalizeCatalogPricing(
  raw: CatalogPricing,
  _billingTier?: string,
): NormalizedCatalogPricing {
  return raw;
}
