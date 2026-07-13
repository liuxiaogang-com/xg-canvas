import { browserCookieOptions, requestUsesHttps } from './cookie-policy';

function request(options: { secure?: boolean; forwardedProto?: string } = {}) {
  return {
    secure: options.secure ?? false,
    get: jest.fn((name: string) =>
      name.toLowerCase() === 'x-forwarded-proto' ? options.forwardedProto : undefined,
    ),
  } as never;
}

describe('browser cookie policy', () => {
  it('allows session cookies on plain LAN HTTP', () => {
    const req = request({ forwardedProto: 'http' });

    expect(requestUsesHttps(req)).toBe(false);
    expect(browserCookieOptions(req)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
  });

  it('sets Secure for a direct HTTPS request', () => {
    expect(requestUsesHttps(request({ secure: true }))).toBe(true);
  });

  it('sets Secure when HTTPS terminates at the web reverse proxy', () => {
    expect(requestUsesHttps(request({ forwardedProto: 'https' }))).toBe(true);
  });

  it('uses the original protocol from a forwarded proxy chain', () => {
    expect(requestUsesHttps(request({ forwardedProto: 'https, http' }))).toBe(true);
    expect(requestUsesHttps(request({ forwardedProto: 'http, https' }))).toBe(false);
  });
});
