import { ConflictException } from '@nestjs/common';
import { SetupService } from './setup.service';

function redisMock() {
  const raw = { incr: jest.fn(async () => 1), expire: jest.fn(async () => 1) };
  return { service: { raw: () => raw }, raw };
}

describe('SetupService', () => {
  it('rejects a completed setup before running the expensive password hash', async () => {
    const ds = { query: jest.fn(async () => [{ completed_at: new Date() }]) };
    const identities = { hashPassword: jest.fn() };
    const redis = redisMock();
    const service = new SetupService(
      ds as never,
      identities as never,
      {} as never,
      redis.service as never,
    );

    await expect(
      service.complete(
        {
          email: 'owner@example.com',
          password: 'StrongPassword123!',
          display_name: 'Owner',
        },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(identities.hashPassword).not.toHaveBeenCalled();
    expect(redis.raw.incr).not.toHaveBeenCalled();
  });

  it('creates the first owner atomically without a setup token', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT completed_at')) return [{ completed_at: null }];
        if (sql.includes("FROM canvas.roles WHERE key='it_super_admin'")) return [{ id: 'role-1' }];
        if (sql.includes('RETURNING id')) return [{ id: 1 }];
        return [];
      }),
    };
    const ds = {
      query: jest.fn(async () => [{ completed_at: null }]),
      transaction: jest.fn(async (fn: (manager: typeof em) => unknown) => fn(em)),
    };
    const identities = {
      hashPassword: jest.fn(async () => 'password-hash'),
      createPasswordUser: jest.fn(async () => 'user-1'),
    };
    const auth = { issueForUserId: jest.fn(async () => ({ token: 'session' })) };
    const redis = redisMock();
    const service = new SetupService(
      ds as never,
      identities as never,
      auth as never,
      redis.service as never,
    );

    await expect(
      service.complete(
        {
          email: 'OWNER@EXAMPLE.COM',
          password: 'StrongPassword123!',
          display_name: ' Owner ',
        },
        { ip: '127.0.0.1' },
      ),
    ).resolves.toEqual({ token: 'session' });

    expect(identities.createPasswordUser).toHaveBeenCalledWith(
      em,
      'owner@example.com',
      'password-hash',
      'Owner',
    );
    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('SET is_instance_owner=true'),
      ['user-1'],
    );
    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('completed_at=now()'),
      ['user-1'],
    );
  });

  it('fails closed when an old database has users but no owner or super admin', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT completed_at')) return [];
        if (sql.includes('SELECT u.id')) return [];
        if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
        return [];
      }),
    };
    const ds = { transaction: jest.fn(async (fn: (manager: typeof em) => unknown) => fn(em)) };
    const service = new SetupService(
      ds as never,
      {} as never,
      {} as never,
      redisMock().service as never,
    );

    await expect(service.onModuleInit()).rejects.toThrow('INSTANCE_SETUP_RECOVERY_REQUIRED');
  });
});
