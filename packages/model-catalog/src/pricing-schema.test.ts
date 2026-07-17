import { describe, expect, it } from 'vitest';
import { CatalogPricingSchema } from './pricing-schema';

describe('CatalogPricingSchema', () => {
  it('rejects duplicate meters within one rate card', () => {
    const result = CatalogPricingSchema.safeParse({
      currency: 'USD',
      components: [
        { meter: 'requests', per: 1, price: 0.01 },
        { meter: 'requests', per: 100, price: 0.5 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['components', 1, 'meter'],
            message: 'pricing components must not contain duplicate meters',
          }),
        ]),
      );
    }
  });

  it('accepts one component per meter', () => {
    expect(
      CatalogPricingSchema.safeParse({
        currency: 'USD',
        components: [
          { meter: 'input_tokens', per: 1_000, price: 0.001 },
          { meter: 'output_tokens', per: 1_000, price: 0.002 },
        ],
      }).success,
    ).toBe(true);
  });
});
