import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { LibraryService } from './library.service';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

describe('LibraryService policies', () => {
  function setup() {
    const entries = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'entry-1', provider_refs: [], ...value })),
      findOne: jest.fn(),
    };
    const projects = { findOne: jest.fn(async () => ({ id: PROJECT, workspace_id: WORKSPACE })) };
    const workspaces = { assertMember: jest.fn(async () => undefined) };
    const authz = {
      can: jest.fn(async () => true),
      isSuperOrOwner: jest.fn(async () => false),
    };
    const assets = { getReadableInWorkspaceOrThrow: jest.fn(async (): Promise<any[]> => []) };
    const service = new LibraryService(
      entries as never,
      projects as never,
      workspaces as never,
      authz as never,
      assets as never,
    );
    return { service, entries, projects, workspaces, authz, assets };
  }

  it('defaults a null-project entry to private', async () => {
    const h = setup();
    const result = await h.service.create(USER, WORKSPACE, { kind: 'character', name: ' Alice ' });
    expect(h.entries.create).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'workspace', project_id: null, visibility: 'private', name: 'Alice', provider_refs: [],
    }));
    expect(result).toMatchObject({ visibility: 'private' });
  });

  it('rejects project visibility without a project', async () => {
    const h = setup();
    await expect(h.service.create(USER, WORKSPACE, {
      kind: 'character', name: 'Alice', visibility: 'project',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires system.content.manage for workspace publication', async () => {
    const h = setup();
    h.authz.can.mockResolvedValue(false);
    await expect(h.service.create(USER, WORKSPACE, {
      kind: 'style', name: 'Public style', visibility: 'workspace',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authz.can).toHaveBeenCalledWith(USER, 'system.content.manage', 'system', null);
  });

  it('checks project.library.create in the service', async () => {
    const h = setup();
    h.authz.can.mockResolvedValue(false);
    await expect(h.service.create(USER, WORKSPACE, {
      kind: 'character', name: 'Alice', project_id: PROJECT,
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authz.can).toHaveBeenCalledWith(USER, 'project.library.create', 'project', PROJECT);
  });

  it('rejects public entries backed by private assets', async () => {
    const h = setup();
    h.assets.getReadableInWorkspaceOrThrow.mockResolvedValue([
      { id: 'asset-1', visibility: 'private', project_id: null },
    ]);
    await expect(h.service.create(USER, WORKSPACE, {
      kind: 'voice', name: 'Voice', visibility: 'workspace', material: { asset_ids: ['asset-1'] },
    })).rejects.toMatchObject({ response: { code: 'REFERENCE_VISIBILITY_MISMATCH' } });
  });

  it('allows a project entry to use a same-project project asset', async () => {
    const h = setup();
    h.assets.getReadableInWorkspaceOrThrow.mockResolvedValue([
      { id: 'asset-1', visibility: 'project', project_id: PROJECT },
    ]);
    await expect(h.service.create(USER, WORKSPACE, {
      kind: 'character', name: 'Alice', project_id: PROJECT, material: { asset_ids: ['asset-1'] },
    })).resolves.toMatchObject({ project_id: PROJECT, visibility: 'project' });
  });

  it('validates the complete next state when visibility changes', async () => {
    const h = setup();
    h.entries.findOne.mockResolvedValue(entry({ owner_id: USER, visibility: 'private' }));
    h.assets.getReadableInWorkspaceOrThrow.mockResolvedValue([
      { id: 'asset-1', visibility: 'private', project_id: null },
    ]);
    await expect(h.service.update(USER, WORKSPACE, 'entry-1', { visibility: 'workspace' }))
      .rejects.toMatchObject({ response: { code: 'REFERENCE_VISIBILITY_MISMATCH' } });
  });

  it('does not let content managers read or edit another user private entry', async () => {
    const h = setup();
    h.entries.findOne.mockResolvedValue(entry({ owner_id: OTHER, visibility: 'private' }));
    h.authz.can.mockResolvedValue(true);
    await expect(h.service.update(USER, WORKSPACE, 'entry-1', { name: 'stolen' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails closed for malformed project visibility without a project id', async () => {
    const h = setup();
    h.entries.findOne.mockResolvedValue(entry({ visibility: 'project', project_id: null }));
    await expect(h.service.getOrThrow(USER, 'entry-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1', kind: 'character', scope: 'workspace', visibility: 'private',
    workspace_id: WORKSPACE, project_id: null, owner_id: USER, name: 'Alice', description: null,
    tags: [], cover_asset_id: null, material: { asset_ids: ['asset-1'] }, provider_refs: [],
    deleted_at: null, ...overrides,
  };
}
