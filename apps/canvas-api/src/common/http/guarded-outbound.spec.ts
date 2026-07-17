import {
  guardedFetch,
  isPublicIpAddress,
  resolvePublicTarget,
  UnsafeOutboundAddressError,
} from './guarded-outbound';

describe('guarded outbound HTTP', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );

  it('rejects a hostname when any DNS answer is non-public', async () => {
    await expect(
      resolvePublicTarget('mixed.example', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafeOutboundAddressError);
  });

  it('passes the already validated address to the pinned transport', async () => {
    const requestOnce = jest.fn(async (_url, _init, target) =>
      Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    );
    await guardedFetch(
      'https://vendor.example/v1',
      {},
      {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        requestOnce,
      },
    );
    expect(requestOnce.mock.calls[0][2]).toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('revalidates every redirect and rejects a private redirect target', async () => {
    const requestOnce = jest.fn(async () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'https://private.example/latest' },
        }),
      ),
    );
    await expect(
      guardedFetch(
        'https://public.example/asset',
        {},
        {
          redirect: 'follow',
          lookup: async (hostname) => [
            { address: hostname === 'private.example' ? '169.254.169.254' : '8.8.8.8', family: 4 },
          ],
          requestOnce,
        },
      ),
    ).rejects.toBeInstanceOf(UnsafeOutboundAddressError);
    expect(requestOnce).toHaveBeenCalledTimes(1);
  });

  it('strips credentials before a cross-origin asset redirect', async () => {
    const seen: Headers[] = [];
    const requestOnce = jest.fn(async (url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return url.hostname === 'public.example'
        ? new Response(null, { status: 302, headers: { location: 'https://cdn.example/a' } })
        : new Response('asset', { status: 200 });
    });
    await guardedFetch(
      'https://public.example/asset',
      { headers: { authorization: 'Bearer test-secret', cookie: 'sid=test-secret' } },
      {
        redirect: 'follow',
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        requestOnce,
      },
    );
    expect(seen[0].get('authorization')).toBe('Bearer test-secret');
    expect(seen[1].has('authorization')).toBe(false);
    expect(seen[1].has('cookie')).toBe(false);
  });
});
