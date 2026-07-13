import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  it.each([
    { status: 'disabled', merged_into_user_id: null },
    { status: 'active', merged_into_user_id: 'survivor-user-id' },
  ])('does not issue sessions for disabled or merged users', async (state) => {
    const sessions = { issue: jest.fn() };
    const service = new AuthService(
      { findOne: jest.fn(async () => ({ id: 'user-id', ...state })) } as never,
      {} as never,
      {} as never,
      {} as never,
      sessions as never,
    );

    const error = await service.issueForUserId('user-id', {}, 'oauth').catch((value) => value);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'ACCOUNT_DISABLED' });
    expect(sessions.issue).not.toHaveBeenCalled();
  });
});
