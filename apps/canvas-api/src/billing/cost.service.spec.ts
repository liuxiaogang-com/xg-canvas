import { CostService } from './cost.service';

describe('CostService immutable rate pricing', () => {
  const models = { getRateCardPricing: jest.fn() };
  const service = new CostService(models as never);

  beforeEach(() => jest.clearAllMocks());

  it('uses native usage meters from the pinned rate revision', async () => {
    models.getRateCardPricing.mockResolvedValue({
      currency: 'CNY',
      components: [
        { meter: 'input_tokens', per: 1000, price: 2 },
        { meter: 'output_tokens', per: 1000, price: 8 },
      ],
    });

    await expect(
      service.computeCost('rate-revision-1', {
        input_tokens: 1500,
        output_tokens: 500,
      }),
    ).resolves.toEqual({ cost: 7, currency: 'CNY' });
    expect(models.getRateCardPricing).toHaveBeenCalledWith('rate-revision-1');
  });

  it('does not fall back to current model pricing without a pinned revision', async () => {
    await expect(service.computeCost(null, { input_tokens: 1000 })).resolves.toBeNull();
    expect(models.getRateCardPricing).not.toHaveBeenCalled();
  });

  it('rejects a legacy unit/price shape instead of silently converting it', async () => {
    models.getRateCardPricing.mockResolvedValue({
      currency: 'USD',
      unit: 'image',
      price_per_image: 0.04,
    });
    await expect(service.computeCost('rate-revision-2', { image_count: 3 })).rejects.toThrow(
      'invalid pinned Rate Card pricing rate-revision-2',
    );
  });

  it('uses only canonical component pricing even when usage carries a billing tier', async () => {
    models.getRateCardPricing.mockResolvedValue({
      currency: 'USD',
      components: [{ meter: 'image_count', per: 1, price: 0.08 }],
    });
    await expect(
      service.computeCost('rate-revision-3', {
        image_count: 2,
        billing_tier: 'hd',
      }),
    ).resolves.toEqual({ cost: 0.16, currency: 'USD' });
  });

  it('does not hide a pinned Rate Card lookup failure', async () => {
    models.getRateCardPricing.mockRejectedValue(new Error('registry unavailable'));
    await expect(service.computeCost('rate-revision-4', { requests: 1 })).rejects.toThrow(
      'registry unavailable',
    );
  });
});
