import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { EntityService } from './entity.service';

const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

describe('EntityService reference boundaries', () => {
  function setup() {
    const entities = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'entity-1', ...value })),
      findOne: jest.fn(),
      remove: jest.fn(async () => undefined),
    };
    const favorites = { delete: jest.fn(async () => ({ affected: 1 })) };
    const projects = { getOrThrow: jest.fn(async () => ({ id: PROJECT, workspace_id: WORKSPACE })) };
    const authz = { can: jest.fn(async () => true) };
    const assets = { getReadableInWorkspaceOrThrow: jest.fn(async (): Promise<any[]> => []) };
    const library = { getInWorkspaceOrThrow: jest.fn(async (): Promise<any> => ({
      id: 'library-1', workspace_id: WORKSPACE, project_id: PROJECT, visibility: 'project',
    })) };
    const service = new EntityService(
      entities as never,
      favorites as never,
      projects as never,
      authz as never,
      assets as never,
      library as never,
    );
    return { service, entities, favorites, projects, authz, assets, library };
  }

  it('allows workspace or same-project assets on create', async () => {
    const h = setup();
    h.assets.getReadableInWorkspaceOrThrow.mockResolvedValue([
      { id: 'a', visibility: 'project', project_id: PROJECT },
      { id: 'b', visibility: 'workspace', project_id: null },
    ]);
    await expect(h.service.create(USER, {
      project_id: PROJECT, type: 'character', name: ' Alice ', ref_asset_ids: ['a', 'b'],
    })).resolves.toMatchObject({ name: 'Alice', ref_asset_ids: ['a', 'b'] });
  });

  it('rejects private and other-project assets', async () => {
    const h = setup();
    h.assets.getReadableInWorkspaceOrThrow.mockResolvedValue([
      { id: 'private', visibility: 'private', project_id: null },
    ]);
    await expect(h.service.create(USER, {
      project_id: PROJECT, type: 'character', name: 'Alice', ref_asset_ids: ['private'],
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates the full next state and rejects a private library link', async () => {
    const h = setup();
    h.entities.findOne.mockResolvedValue(entity());
    h.library.getInWorkspaceOrThrow.mockResolvedValue({
      id: 'library-1', workspace_id: WORKSPACE, project_id: null, visibility: 'private',
    });
    await expect(h.service.update(USER, 'entity-1', { library_entry_id: 'library-1' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(h.entities.save).not.toHaveBeenCalled();
  });

  it('supports explicitly unlinking generated assets and library entries', async () => {
    const h = setup();
    h.entities.findOne.mockResolvedValue(entity({ generated_asset_id: 'a', library_entry_id: 'library-1' }));
    await expect(h.service.update(USER, 'entity-1', {
      generated_asset_id: null, library_entry_id: null,
    })).resolves.toMatchObject({ generated_asset_id: null, library_entry_id: null });
  });

  it('binds favorite reads to the active workspace and project.read', async () => {
    const h = setup();
    h.entities.findOne.mockResolvedValue(entity());
    h.projects.getOrThrow.mockResolvedValue({ id: PROJECT, workspace_id: 'other-workspace' });
    await expect(h.service.getInWorkspaceOrThrow(USER, 'entity-1', WORKSPACE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes entity favorites before hard deletion', async () => {
    const h = setup();
    h.entities.findOne.mockResolvedValue(entity());
    await h.service.remove(USER, 'entity-1');
    expect(h.favorites.delete).toHaveBeenCalledWith({ target_type: 'entity', target_id: 'entity-1' });
    expect(h.entities.remove).toHaveBeenCalled();
  });
});

function entity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity-1', project_id: PROJECT, type: 'character', name: 'Alice', description: null,
    ref_asset_ids: [], generated_asset_id: null, library_entry_id: null, data: {}, ...overrides,
  };
}
