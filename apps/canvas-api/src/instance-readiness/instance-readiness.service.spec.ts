import { InstanceReadinessService } from './instance-readiness.service';

describe('InstanceReadinessService model boundary', () => {
  it('probes model availability only through AccountModelsClient', async () => {
    const models = {
      getAvailableModels: jest.fn(async ({ taskType }: { taskType?: string }) =>
        taskType === 'gen.image' ? [{ model_id: 'example:image' }] : [],
      ),
    };
    const service = new InstanceReadinessService(
      { readinessStatus: jest.fn(async () => 'ready') } as never,
      { readinessStatus: jest.fn(async () => 'ready') } as never,
      models as never,
    );

    const snapshot = await service.snapshot();

    expect(models.getAvailableModels).toHaveBeenCalledTimes(3);
    expect(models.getAvailableModels).toHaveBeenCalledWith({ taskType: 'gen.text' });
    expect(models.getAvailableModels).toHaveBeenCalledWith({ taskType: 'gen.image' });
    expect(models.getAvailableModels).toHaveBeenCalledWith({ taskType: 'gen.video' });
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        { id: 'modality_image', status: 'ready' },
        { id: 'modality_text', status: 'missing' },
        { id: 'modality_video', status: 'missing' },
      ]),
    );
  });
});
