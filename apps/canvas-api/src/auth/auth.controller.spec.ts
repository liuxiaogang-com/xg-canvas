import { UnauthorizedException } from '@nestjs/common';

import { AuthController } from './auth.controller';

function requestWithToken(token = 'session-token') {
  return {
    cookies: { xgcanvas_session: token },
    headers: {},
    secure: false,
    get: jest.fn((name: string) => (name.toLowerCase() === 'x-forwarded-proto' ? 'http' : undefined)),
  } as never;
}

function response() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('AuthController refresh', () => {
  it('renews both the server session and browser cookie', async () => {
    const sessions = { refresh: jest.fn(async () => true) };
    const controller = new AuthController({} as never, sessions as never, {} as never);
    const req = requestWithToken();
    const res = response();

    await expect(controller.refresh(req, res as never)).resolves.toEqual({ refreshed: true });
    expect(sessions.refresh).toHaveBeenCalledWith('session-token');
    expect(res.cookie).toHaveBeenCalledWith(
      'xgcanvas_session',
      'session-token',
      expect.objectContaining({ httpOnly: true, secure: false, maxAge: expect.any(Number) }),
    );
  });

  it('does not restore an invalid session cookie', async () => {
    const sessions = { refresh: jest.fn(async () => false) };
    const controller = new AuthController({} as never, sessions as never, {} as never);
    const res = response();

    await expect(controller.refresh(requestWithToken(), res as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
