import { VerificationService } from './verification.service';

function serviceFor(nodeEnv: 'development' | 'production') {
  const challenges = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
  };
  const emailSender = {
    sendMagicLink: jest.fn(async () => true),
  };
  const config = {
    get: jest.fn((name: string) => {
      if (name === 'NODE_ENV') return nodeEnv;
      if (name === 'PUBLIC_BASE_URL') return 'https://example.test';
      return undefined;
    }),
  };
  return {
    service: new VerificationService(challenges as never, emailSender as never, config as never),
    challenges,
    emailSender,
  };
}

describe('VerificationService magic links', () => {
  it('never reveals the login token in production', async () => {
    const { service, emailSender } = serviceFor('production');

    const result = await service.createMagicLink('owner@example.com');

    expect(result).toEqual({ sent: true });
    expect(emailSender.sendMagicLink).toHaveBeenCalledWith(
      'owner@example.com',
      expect.stringContaining('/api/v1/auth/magic?token='),
    );
  });

  it('reveals only devToken outside production', async () => {
    const { service } = serviceFor('development');

    const result = await service.createMagicLink('owner@example.com');

    expect(result.sent).toBe(true);
    expect(result.devToken).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('token');
  });

  it('atomically consumes a magic token only once', async () => {
    const { service, challenges } = serviceFor('production');
    challenges.findOne.mockResolvedValue({
      id: 'challenge-id',
      target: 'owner@example.com',
      user_id: 'user-id',
      token_hash: 'stored-hash',
      expires_at: new Date(Date.now() + 60_000),
    });
    challenges.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(service.consumeMagic('magic-token')).resolves.toEqual({
      target: 'owner@example.com',
      userId: 'user-id',
    });
    await expect(service.consumeMagic('magic-token')).resolves.toBeNull();
  });
});
