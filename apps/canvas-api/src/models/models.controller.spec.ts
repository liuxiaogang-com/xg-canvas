import { ModelsController } from './models.controller';

describe('ModelsController account-client boundary', () => {
  const models = {
    getAvailableModels: jest.fn(),
    getModelDetail: jest.fn(),
    estimateCost: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('passes availability reads through AccountModelsClient', async () => {
    models.getAvailableModels.mockResolvedValue([]);
    const controller = new ModelsController(models as never);

    await expect(controller.list('gen.image')).resolves.toEqual([]);
    expect(models.getAvailableModels).toHaveBeenCalledWith({ taskType: 'gen.image' });
  });

  it('preserves an unavailable native-currency estimate', async () => {
    const detail = { model_id: 'example:model', pricing: null };
    const estimate = {
      estimated_cost: null,
      currency: null,
      breakdown: '该模型暂无定价信息',
    };
    models.getModelDetail.mockResolvedValue(detail);
    models.estimateCost.mockReturnValue(estimate);
    const controller = new ModelsController(models as never);

    await expect(
      controller.estimateCost({
        model_id: 'example:model',
        params: {},
      }),
    ).resolves.toBe(estimate);
    expect(models.getModelDetail).toHaveBeenCalledWith('example:model');
    expect(models.estimateCost).toHaveBeenCalledWith(detail, {});
  });
});
