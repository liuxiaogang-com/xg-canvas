import { AuthzService } from './authz.service';
import { ALL_PERMISSION_KEYS } from './catalog';

type UserRow = { id: string; is_instance_owner: boolean; status: string; merged_into_user_id: string | null };

function makeService(user: UserRow | null, cache: string | null = null) {
  const users = { findOne: jest.fn().mockResolvedValue(user) };
  const auditRepo = { save: jest.fn(), create: jest.fn((x) => x) };
  const ds = { query: jest.fn().mockResolvedValue([]) };
  const redisRaw = { smembers: jest.fn().mockResolvedValue([]), sadd: jest.fn() };
  const redis = {
    get: jest.fn().mockResolvedValue(cache),
    set: jest.fn(),
    del: jest.fn(),
    raw: () => redisRaw,
  };
  const svc = new AuthzService(users as never, auditRepo as never, ds as never, redis as never);
  return { svc, users, ds, redis };
}

const active = (over: Partial<UserRow> = {}): UserRow => ({
  id: 'u',
  is_instance_owner: false,
  status: 'active',
  merged_into_user_id: null,
  ...over,
});

describe('AuthzService.isSuperOrOwner', () => {
  it('true for an active instance owner', async () => {
    const { svc } = makeService(active({ is_instance_owner: true }));
    expect(await svc.isSuperOrOwner('u')).toBe(true);
  });

  it('false for a disabled account even if owner', async () => {
    const { svc } = makeService(active({ is_instance_owner: true, status: 'disabled' }));
    expect(await svc.isSuperOrOwner('u')).toBe(false);
  });

  it('false for a merged (tombstoned) account', async () => {
    const { svc } = makeService(active({ is_instance_owner: true, merged_into_user_id: 'x' }));
    expect(await svc.isSuperOrOwner('u')).toBe(false);
  });

  it('true via an it_super_admin binding', async () => {
    const { svc, ds } = makeService(active());
    ds.query.mockResolvedValueOnce([{ one: 1 }]); // super-binding lookup
    expect(await svc.isSuperOrOwner('u')).toBe(true);
  });

  it('false for an unknown user', async () => {
    const { svc } = makeService(null);
    expect(await svc.isSuperOrOwner('u')).toBe(false);
  });
});

describe('AuthzService.resolveCapabilities', () => {
  it('super admin short-circuits to the full catalog', async () => {
    const { svc } = makeService(active({ is_instance_owner: true }));
    const caps = await svc.resolveCapabilities('u', 'system', null);
    expect(caps.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('returns the cached set on a cache hit', async () => {
    const { svc } = makeService(active(), JSON.stringify(['project.read']));
    const caps = await svc.resolveCapabilities('u', 'project', 'p1');
    expect([...caps]).toEqual(['project.read']);
  });

  it('unions system + project bindings on a cache miss', async () => {
    const { svc, ds } = makeService(active());
    ds.query
      .mockResolvedValueOnce([]) // isSuperOrOwner: no super binding
      .mockResolvedValueOnce([{ permission_key: 'system.billing.view' }]) // system bindings
      .mockResolvedValueOnce([{ permission_key: 'project.read' }]); // project bindings
    const caps = await svc.resolveCapabilities('u', 'project', 'p1');
    expect([...caps].sort()).toEqual(['project.read', 'system.billing.view']);
  });
});
