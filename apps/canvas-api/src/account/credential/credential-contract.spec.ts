import { assertCredentialContract } from './credential-contract';

describe('assertCredentialContract', () => {
  it('accepts only the exact api_key payload for api_key Providers', () => {
    expect(() =>
      assertCredentialContract('api_key', 'api_key', { api_key: 'secret' }),
    ).not.toThrow();
    expect(() => assertCredentialContract('api_key', 'oauth_token', { api_key: 'secret' })).toThrow(
      'credential_type api_key',
    );
    expect(() =>
      assertCredentialContract('api_key', 'api_key', {
        api_key: 'secret',
        unexpected: 'value',
      }),
    ).toThrow('exactly one');
  });

  it('accepts only an empty cli_session marker for cli_login Providers', () => {
    expect(() => assertCredentialContract('cli_login', 'cli_session', {})).not.toThrow();
    expect(() => assertCredentialContract('cli_login', 'cli_session', { cookie: 'value' })).toThrow(
      'empty cli_session',
    );
  });

  it('fails closed for an auth method without an implemented credential contract', () => {
    expect(() => assertCredentialContract('oauth', 'oauth_token', { token: 'value' })).toThrow(
      'does not support auth_method oauth',
    );
  });
});
