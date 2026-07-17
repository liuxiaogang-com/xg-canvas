import { ModelCredential } from '../credential/credential.entity';
import { OutboundRouteSecurityService } from './outbound-route-security.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_UID = '22222222-2222-4222-8222-222222222222';

describe('OutboundRouteSecurityService', () => {
  const credentialRepo = { exists: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === ModelCredential) return credentialRepo;
      throw new Error(`unexpected repository ${String(entity)}`);
    }),
  };
  const authz = { can: jest.fn() };
  const service = new OutboundRouteSecurityService(authz as never);

  beforeEach(() => jest.clearAllMocks());

  it('blocks a model manager from redirecting an active credential to another origin', async () => {
    credentialRepo.exists.mockResolvedValue(true);
    authz.can.mockResolvedValue(false);

    await expect(
      service.assertCredentialRouteChangeAllowed(manager as never, USER_ID, [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://vendor.example/v1',
          next_base_url: 'https://attacker.example/v1',
        },
      ]),
    ).rejects.toMatchObject({
      response: { code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN' },
    });
    expect(authz.can).toHaveBeenCalledWith(USER_ID, 'system.credential.manage', 'system', null);
  });

  it('allows a credential manager to approve the origin change', async () => {
    credentialRepo.exists.mockResolvedValue(true);
    authz.can.mockResolvedValue(true);

    await expect(
      service.assertCredentialRouteChangeAllowed(manager as never, USER_ID, [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://vendor.example/v1',
          next_base_url: 'https://private-gateway.example/v1',
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('does not require credential permission for a path-only change on the same origin', async () => {
    await expect(
      service.assertCredentialRouteChangeAllowed(manager as never, USER_ID, [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://vendor.example/v1',
          next_base_url: 'https://vendor.example/v2',
        },
      ]),
    ).resolves.toBeUndefined();
    expect(credentialRepo.exists).not.toHaveBeenCalled();
    expect(authz.can).not.toHaveBeenCalled();
  });

  it('does not elevate a route without an enabled non-archived credential', async () => {
    credentialRepo.exists.mockResolvedValue(false);

    await expect(
      service.assertCredentialRouteChangeAllowed(manager as never, USER_ID, [
        {
          channel_resource_uid: CHANNEL_UID,
          current_base_url: 'https://vendor.example/v1',
          next_base_url: 'https://gateway.example/v1',
        },
      ]),
    ).resolves.toBeUndefined();
    expect(authz.can).not.toHaveBeenCalled();
  });
});
