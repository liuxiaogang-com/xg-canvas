import { AuthLoginController } from './auth-login.controller';

describe('AuthLoginController config contract', () => {
  it('publishes only supported methods and configured OAuth providers', () => {
    const authConfig = { snapshot: jest.fn(() => ({ methods: ['password'] })) };
    const registry = { keys: jest.fn(() => ['wechat_oa']) };
    const controller = new AuthLoginController(
      {} as never,
      {} as never,
      {} as never,
      authConfig as never,
      registry as never,
    );

    const config = controller.config();

    expect(config).toEqual({ methods: ['password'], oauth: ['wechat_oa'] });
    expect(config).not.toHaveProperty('mock');
  });
});
