import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { FavoriteService } from './favorite.service';

const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';

describe('FavoriteService', () => {
  function setup() {
    const execute = jest.fn(async () => undefined);
    const favorites = {
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({ values: () => ({ orIgnore: () => ({ execute }) }) }),
      })),
      find: jest.fn(async (): Promise<any[]> => []),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    const assets = { getInWorkspaceOrThrow: jest.fn(async () => ({ id: 'target' })) };
    const library = { getInWorkspaceOrThrow: jest.fn(async () => ({ id: 'target' })) };
    const entities = { getInWorkspaceOrThrow: jest.fn(async () => ({ id: 'target' })) };
    const service = new FavoriteService(favorites as never, assets as never, library as never, entities as never);
    return { service, favorites, assets, library, entities, execute };
  }

  it.each(['asset', 'library_entry', 'entity'] as const)('validates a readable %s before insert', async (type) => {
    const h = setup();
    await h.service.add(USER, WORKSPACE, type, 'target');
    const target = type === 'asset' ? h.assets : type === 'library_entry' ? h.library : h.entities;
    expect(target.getInWorkspaceOrThrow).toHaveBeenCalledWith(USER, 'target', WORKSPACE);
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  it('turns inaccessible targets into a non-enumerating 404', async () => {
    const h = setup();
    h.assets.getInWorkspaceOrThrow.mockRejectedValue(new ForbiddenException('private'));
    await expect(h.service.add(USER, WORKSPACE, 'asset', 'target')).rejects.toBeInstanceOf(NotFoundException);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('filters deleted or newly inaccessible targets from list', async () => {
    const h = setup();
    h.favorites.find.mockResolvedValue([
      { target_id: 'visible' }, { target_id: 'missing' },
    ]);
    h.assets.getInWorkspaceOrThrow
      .mockResolvedValueOnce({ id: 'visible' })
      .mockRejectedValueOnce(new NotFoundException('missing'));
    await expect(h.service.listIds(USER, WORKSPACE, 'asset')).resolves.toEqual(['visible']);
  });

  it('allows removing an orphan without reading its target', async () => {
    const h = setup();
    await h.service.remove(USER, 'asset', 'missing');
    expect(h.favorites.delete).toHaveBeenCalledWith({
      user_id: USER, target_type: 'asset', target_id: 'missing',
    });
    expect(h.assets.getInWorkspaceOrThrow).not.toHaveBeenCalled();
  });
});
