import { ForbiddenException } from '@nestjs/common';

import { AssetUploadService, MAX_UPLOAD_BYTES } from './asset-upload.service';

const USER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const DRAFT = '44444444-4444-4444-8444-444444444444';

describe('AssetUploadService', () => {
  function setup() {
    const assets = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'asset-1', ...value })),
    };
    const drafts = {
      create: jest.fn((value) => ({ ...value, id: DRAFT })),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
    };
    const projects = { findOne: jest.fn(async () => ({ id: PROJECT, workspace_id: WORKSPACE })) };
    const workspaces = { assertMember: jest.fn(async () => undefined) };
    const urls = {
      putObject: jest.fn(async (key: string) => `https://upload.example/${key}`),
      headObject: jest.fn(),
      copyObject: jest.fn(async () => undefined),
      deleteObject: jest.fn(async () => undefined),
      bucket: jest.fn(async () => 'assets'),
    };
    const authz = { can: jest.fn(async () => true) };
    const cleanup = { cleanCompleted: jest.fn(async () => undefined) };
    const managerDrafts = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const managerAssets = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'asset-1', ...value })),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'AssetUploadDraft' ? managerDrafts : managerAssets,
      ),
    };
    const ds = { transaction: jest.fn(async (fn) => fn(manager)) };
    const service = new AssetUploadService(
      assets as never,
      drafts as never,
      projects as never,
      workspaces as never,
      urls as never,
      authz as never,
      cleanup as never,
      ds as never,
    );
    return {
      service,
      assets,
      drafts,
      projects,
      workspaces,
      urls,
      authz,
      cleanup,
      managerDrafts,
      managerAssets,
      ds,
    };
  }

  it('creates a durable null-project intent as private with staging keys', async () => {
    const h = setup();
    const result = await h.service.createIntent(USER, WORKSPACE, {
      type: 'image',
      mime_type: 'IMAGE/PNG; charset=binary',
      bytes: 123,
      name: 'fixture.png',
      with_thumbnail: true,
    });

    expect(h.workspaces.assertMember).toHaveBeenCalledWith(USER, WORKSPACE);
    expect(h.drafts.save).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: USER,
        workspace_id: WORKSPACE,
        project_id: null,
        visibility: 'private',
        mime_type: 'image/png',
        storage_key: expect.stringMatching(/^xgcanvas\/staging\/uploads\//),
        status: 'pending',
      }),
    );
    expect(result).toMatchObject({ draft_id: DRAFT, expires_in: 900 });
    expect(h.urls.putObject).toHaveBeenCalledTimes(2);
  });

  it('requires system.content.manage to publish a null-project workspace asset', async () => {
    const h = setup();
    h.authz.can.mockResolvedValue(false);
    await expect(
      h.service.createIntent(USER, WORKSPACE, {
        type: 'image',
        mime_type: 'image/png',
        bytes: 1,
        visibility: 'workspace',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authz.can).toHaveBeenCalledWith(USER, 'system.content.manage', 'system', null);
    expect(h.drafts.save).not.toHaveBeenCalled();
  });

  it('checks project workspace and project.asset.create in the service', async () => {
    const h = setup();
    h.authz.can.mockResolvedValue(false);
    await expect(
      h.service.createIntent(USER, WORKSPACE, {
        type: 'video',
        mime_type: 'video/mp4',
        bytes: 12,
        project_id: PROJECT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authz.can).toHaveBeenCalledWith(USER, 'project.asset.create', 'project', PROJECT);
  });

  it('also requires content management before a project asset can become workspace-visible', async () => {
    const h = setup();
    h.authz.can.mockResolvedValue(false);
    await expect(
      h.service.createIntent(USER, WORKSPACE, {
        type: 'image',
        mime_type: 'image/png',
        bytes: 10,
        project_id: PROJECT,
        visibility: 'workspace',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.authz.can).toHaveBeenCalledWith(USER, 'system.content.manage', 'system', null);
    expect(h.projects.findOne).not.toHaveBeenCalled();
  });

  it('rejects oversized declarations before creating a draft', async () => {
    const h = setup();
    await expect(
      h.service.createIntent(USER, WORKSPACE, {
        type: 'video',
        mime_type: 'video/mp4',
        bytes: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toMatchObject({ response: { code: 'ASSET_TOO_LARGE' } });
    expect(h.workspaces.assertMember).not.toHaveBeenCalled();
  });

  it('returns the previously materialized row without touching storage', async () => {
    const h = setup();
    const existing = { id: 'asset-1', owner_id: USER, upload_draft_id: DRAFT };
    h.assets.findOne.mockResolvedValue(existing);
    await expect(h.service.complete(USER, DRAFT, {})).resolves.toBe(existing);
    expect(h.drafts.findOne).not.toHaveBeenCalled();
    expect(h.urls.headObject).not.toHaveBeenCalled();
  });

  it('deletes a mismatched direct upload and never inserts an asset', async () => {
    const h = setup();
    h.assets.findOne.mockResolvedValue(null);
    h.managerDrafts.findOne.mockResolvedValue(pendingDraft());
    h.urls.headObject.mockResolvedValue({ size_bytes: 999, mime_type: 'image/png' });

    await expect(h.service.complete(USER, DRAFT, {})).rejects.toMatchObject({
      response: { code: 'UPLOAD_MISMATCH' },
    });
    expect(h.urls.deleteObject).toHaveBeenCalledTimes(2);
    expect(h.ds.transaction).toHaveBeenCalledTimes(1);
  });

  it('locks the draft and materializes exactly one trusted asset row', async () => {
    const h = setup();
    const draft = pendingDraft();
    h.assets.findOne.mockResolvedValue(null);
    h.drafts.findOne.mockResolvedValue(draft);
    h.urls.headObject
      .mockResolvedValueOnce({ size_bytes: 10, mime_type: 'image/png', etag: '"source"' })
      .mockResolvedValueOnce({ size_bytes: 10, mime_type: 'image/png', etag: '"final"' })
      .mockResolvedValueOnce({ size_bytes: 1000, mime_type: 'image/jpeg', etag: '"thumb"' });
    h.managerDrafts.findOne.mockResolvedValue(draft);
    h.managerAssets.findOne.mockResolvedValue(null);

    const asset = await h.service.complete(USER, DRAFT, {
      width: 20,
      height: 10,
      has_thumbnail: true,
    });
    expect(h.managerDrafts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(h.managerAssets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        upload_draft_id: DRAFT,
        visibility: 'private',
        bytes: 10,
        mime_type: 'image/png',
        checksum_sha256: null,
        storage_key: expect.not.stringContaining('/staging/'),
        thumb_storage_key: expect.not.stringContaining('/staging/'),
      }),
    );
    expect(h.urls.copyObject).toHaveBeenCalledTimes(2);
    expect(h.urls.copyObject).toHaveBeenNthCalledWith(
      1,
      draft.storage_key,
      expect.not.stringContaining('/staging/'),
      '"source"',
    );
    expect(draft.status).toBe('completed');
    expect(asset).toMatchObject({ id: 'asset-1', upload_draft_id: DRAFT });
    expect(h.cleanup.cleanCompleted).toHaveBeenCalledWith(DRAFT);
  });

  it('rechecks membership before promoting or materializing an upload', async () => {
    const h = setup();
    h.assets.findOne.mockResolvedValue(null);
    h.managerDrafts.findOne.mockResolvedValue(pendingDraft());
    h.managerAssets.findOne.mockResolvedValue(null);
    h.workspaces.assertMember.mockRejectedValue(new ForbiddenException('removed'));
    await expect(h.service.complete(USER, DRAFT, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.urls.headObject).not.toHaveBeenCalled();
    expect(h.urls.copyObject).not.toHaveBeenCalled();
    expect(h.managerAssets.save).not.toHaveBeenCalled();
  });
});

function pendingDraft() {
  return {
    id: DRAFT,
    owner_id: USER,
    workspace_id: WORKSPACE,
    project_id: null,
    visibility: 'private' as const,
    type: 'image' as const,
    mime_type: 'image/png',
    bytes: 10,
    name: 'fixture.png',
    storage_key: `xgcanvas/staging/uploads/${WORKSPACE}/${DRAFT}/source.png`,
    thumb_storage_key: `xgcanvas/staging/uploads/${WORKSPACE}/${DRAFT}/thumb.jpg`,
    status: 'pending' as const,
    expires_at: new Date(Date.now() + 60_000),
  };
}
