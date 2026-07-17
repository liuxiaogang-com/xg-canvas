import { BillingService } from './billing.service';

describe('BillingService ledger scope', () => {
  it('aggregates only invoke attempts so poll/cancel observability cannot double-count usage', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          requests: 0,
          success: 0,
          error: 0,
          input_tokens: 0,
          output_tokens: 0,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const service = new BillingService({ query } as never);

    await service.overview();
    await service.byModel();

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql] of query.mock.calls) {
      expect(sql).toMatch(/source\s*=\s*'invoke'/);
      expect(sql).toMatch(/attempt_no\s+IS\s+NOT\s+NULL/i);
    }
  });
});
