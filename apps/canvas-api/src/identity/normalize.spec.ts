import { normalizeEmail, normalizePhone } from './normalize';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});

describe('normalizePhone', () => {
  it('keeps an already-international number', () => {
    expect(normalizePhone('+8613800138000')).toBe('+8613800138000');
  });
  it('prefixes a CN mobile with +86', () => {
    expect(normalizePhone('13800138000')).toBe('+8613800138000');
  });
  it('rewrites 0086 to +86', () => {
    expect(normalizePhone('008613800138000')).toBe('+8613800138000');
  });
  it('strips spaces and dashes', () => {
    expect(normalizePhone('138-0013 8000')).toBe('+8613800138000');
  });
});
