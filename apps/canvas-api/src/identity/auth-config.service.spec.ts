import { AuthConfigService } from './auth-config.service';

function service(values: Record<string, string> = {}, emailEnabled = false) {
  const config = { get: jest.fn((name: string) => values[name]) };
  const emailSender = { enabled: emailEnabled };
  return new AuthConfigService(config as never, emailSender as never);
}

describe('AuthConfigService', () => {
  it('advertises only real production delivery methods', () => {
    const auth = service(
      {
        NODE_ENV: 'production',
        AUTH_EMAIL_CODE_ENABLED: 'true',
        AUTH_PHONE_ENABLED: 'true',
      },
      false,
    );

    expect(auth.methods()).toEqual(['password']);
  });

  it('advertises email code when SMTP is usable', () => {
    expect(service({ NODE_ENV: 'production' }, true).methods()).toEqual(['password', 'email_code']);
  });

  it('allows explicit email-code testing outside production without SMTP', () => {
    expect(
      service({ NODE_ENV: 'development', AUTH_EMAIL_CODE_ENABLED: 'true' }, false).methods(),
    ).toEqual(['password', 'email_code']);
  });
});
