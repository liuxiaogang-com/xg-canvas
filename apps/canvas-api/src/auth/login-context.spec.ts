import { cleanIp, labelFromUserAgent } from './login-context';

describe('cleanIp', () => {
  it('renders loopback as 127.0.0.1', () => {
    expect(cleanIp('::1')).toBe('127.0.0.1');
  });
  it('strips the IPv4-mapped-IPv6 prefix', () => {
    expect(cleanIp('::ffff:192.168.1.5')).toBe('192.168.1.5');
  });
  it('passes a normal IPv4 through', () => {
    expect(cleanIp('203.0.113.7')).toBe('203.0.113.7');
  });
  it('returns null for empty', () => {
    expect(cleanIp(undefined)).toBeNull();
    expect(cleanIp(null)).toBeNull();
  });
});

describe('labelFromUserAgent', () => {
  it('labels Chrome on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Chrome/149.0 Safari/537.36';
    expect(labelFromUserAgent(ua)).toBe('Chrome / macOS');
  });
  it('recognizes WeChat', () => {
    expect(labelFromUserAgent('Mozilla/5.0 MicroMessenger/8.0.49')).toContain('微信');
  });
  it('returns null for no UA', () => {
    expect(labelFromUserAgent(null)).toBeNull();
  });
});
