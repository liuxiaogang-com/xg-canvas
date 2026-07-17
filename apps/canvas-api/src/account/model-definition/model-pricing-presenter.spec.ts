import { estimateModelPricing, formatModelPricingSummary } from './model-pricing-presenter';

describe('model pricing presentation', () => {
  const components = {
    currency: 'USD',
    components: [
      { meter: 'input_tokens', per: 1000, price: 0.2 },
      { meter: 'output_tokens', per: 1000, price: 0.8 },
    ],
  };

  it('estimates component pricing with the same normalized contract as billing', () => {
    expect(estimateModelPricing(components, { max_tokens: 500 }, 1500)).toEqual({
      estimated_cost: 0.5,
      currency: 'USD',
      breakdown: '根据当前参数估算，最终以实际用量为准',
    });
  });

  it('renders a useful summary for component pricing', () => {
    expect(formatModelPricingSummary(components)).toContain('1K 输入 tokens');
    expect(formatModelPricingSummary(components)).toContain('1K 输出 tokens');
  });
});
