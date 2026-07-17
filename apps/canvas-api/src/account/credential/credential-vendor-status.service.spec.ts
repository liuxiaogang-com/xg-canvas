import { CredentialVendorStatusService } from './credential-vendor-status.service';

jest.mock('../../common/http/guarded-outbound', () => ({
  guardedFetch: (input: string | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const API_KEY = 'super-secret-api-key';

describe('CredentialVendorStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps Dreamina membership and credit without exposing CLI internals', async () => {
    const service = makeService({
      logged_in: true,
      vip_level: 'VIP 2',
      total_credit: 88,
    });

    await expect(service.fetchDreaminaStatus()).resolves.toEqual({
      items: [
        { label: '会员', value: 'VIP 2', tone: 'success' },
        { label: '积分', value: '88', tone: 'success' },
      ],
      available: true,
    });
  });

  it('returns an unavailable status when Dreamina is logged out', async () => {
    const service = makeService({ logged_in: false, error: '即梦 CLI 未登录' });

    await expect(service.validateDreamina()).resolves.toEqual({
      ok: false,
      message: '即梦 CLI 未登录',
    });
    await expect(service.fetchDreaminaStatus()).resolves.toEqual({
      items: [],
      available: false,
      note: '即梦 CLI 未登录',
    });
  });

  it('maps supported vendor balance responses and sends the key only in Authorization', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            { currency: 'CNY', total_balance: '12.50' },
            { currency: 'USD', total_balance: '0' },
            { currency: 123, total_balance: 'invalid' },
          ],
        }),
        { status: 200 },
      ),
    );
    const service = makeService();

    await expect(service.fetchBalance('https://vendor.test/v1/', API_KEY)).resolves.toEqual({
      items: [
        { label: '余额', value: 'CNY 12.50', tone: 'success' },
        { label: '余额', value: 'USD 0', tone: 'warning' },
      ],
      available: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://vendor.test/v1/user/balance',
      expect.objectContaining({ headers: { authorization: `Bearer ${API_KEY}` } }),
    );
  });

  it('redacts the api key from transport failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error(`request using ${API_KEY} failed`));
    const service = makeService();

    const result = await service.fetchBalance('https://vendor.test/v1', API_KEY);

    expect(result.note).toBe('request using [REDACTED] failed');
    expect(result.note).not.toContain(API_KEY);
  });

  it('normalizes aborted probes to a bounded timeout message', async () => {
    const error = new Error('the request was aborted');
    error.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValue(error);
    const service = makeService();

    await expect(service.pingModels('https://vendor.test/v1', API_KEY)).resolves.toEqual({
      ok: false,
      message: 'Vendor request timed out after 12000ms',
    });
  });

  it('redacts secrets echoed by a vendor models error response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: `invalid credential ${API_KEY}` },
        }),
        { status: 401 },
      ),
    );
    const service = makeService();

    await expect(service.pingModels('https://vendor.test/v1', API_KEY)).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'invalid credential [REDACTED]',
    });
  });
});

function makeService(credit: Record<string, unknown> = { logged_in: false }) {
  const dreamina = { credit: jest.fn(async () => credit) };
  return new CredentialVendorStatusService(dreamina as never);
}
