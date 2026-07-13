import { AssetUploadCleanupService } from './asset-upload-cleanup.service';

describe('AssetUploadCleanupService', () => {
  const row = {
    id: '44444444-4444-4444-8444-444444444444',
    storage_key: 'main',
    thumb_storage_key: 'thumb',
    status: 'pending',
  };

  it('deletes both staged objects before marking a draft expired', async () => {
    const drafts = {
      query: jest.fn(async () => [[row], 1]),
      find: jest.fn(async () => []),
      update: jest.fn(),
      delete: jest.fn(async () => ({ affected: 1 })),
    };
    const urls = { deleteObject: jest.fn(async () => undefined) };
    const service = new AssetUploadCleanupService(drafts as never, urls as never);
    await service.runOnce();
    expect(urls.deleteObject.mock.calls).toEqual([['main'], ['thumb']]);
    expect(drafts.query.mock.invocationCallOrder[0]).toBeLessThan(
      urls.deleteObject.mock.invocationCallOrder[0],
    );
    expect(drafts.delete).toHaveBeenCalledWith({ id: row.id, status: 'expired' });
  });

  it('leaves the expired draft for retry when object cleanup fails', async () => {
    const drafts = {
      query: jest.fn(async () => [row]),
      find: jest.fn(async () => []),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const urls = {
      deleteObject: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
    };
    const service = new AssetUploadCleanupService(drafts as never, urls as never);
    await service.runOnce();
    expect(drafts.delete).not.toHaveBeenCalled();
  });

  it('marks completed staging clean only after both objects are deleted', async () => {
    const completed = { ...row, status: 'completed', staging_cleaned_at: null };
    const drafts = {
      query: jest.fn(async () => []),
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([completed]),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(),
    };
    const urls = { deleteObject: jest.fn(async () => undefined) };
    const service = new AssetUploadCleanupService(drafts as never, urls as never);
    await service.runOnce();
    expect(urls.deleteObject.mock.calls).toEqual([['main'], ['thumb']]);
    expect(drafts.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, status: 'completed' }),
      { staging_cleaned_at: expect.any(Date) },
    );
  });

  it('treats a structured empty UPDATE result as no claimed drafts', async () => {
    const drafts = {
      query: jest.fn(async () => [[], 0]),
      find: jest.fn(async () => []),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const urls = { deleteObject: jest.fn(async () => undefined) };
    const service = new AssetUploadCleanupService(drafts as never, urls as never);

    await service.runOnce();

    expect(urls.deleteObject).not.toHaveBeenCalled();
  });
});
