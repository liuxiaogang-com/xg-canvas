import { AccountModelsClient } from './models.client';

describe('AccountModelsClient task availability', () => {
  const pin = {
    model_resource_uid: '11111111-1111-4111-8111-111111111111',
    model_revision_id: '22222222-2222-4222-8222-222222222222',
    rate_card_revision_id: null,
    catalog_epoch: '1',
  };
  const registry = {
    getSnapshot: jest.fn(() => ({ byId: new Map() })),
  };
  const availability = { requireCurrent: jest.fn() };
  const featureConfig = { requireModel: jest.fn() };
  const modelList = {
    getAvailableModels: jest.fn(),
    getModelDetail: jest.fn(),
    estimateCost: jest.fn(),
  };
  const client = new AccountModelsClient(
    registry as never,
    availability as never,
    featureConfig as never,
    modelList as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('refuses to create a task when no selected channel has an enabled credential', async () => {
    availability.requireCurrent.mockRejectedValue(
      Object.assign(new Error('no enabled credential'), { code: 'CREDENTIAL_INVALID' }),
    );
    await expect(client.resolveTaskPin('example:model', 'gen.text')).rejects.toMatchObject({
      code: 'CREDENTIAL_INVALID',
    });
  });

  it('returns the immutable pin only after channel and credential checks pass', async () => {
    availability.requireCurrent.mockResolvedValue({ model_id: 'example:model', pin });
    await expect(client.resolveTaskPin('example:model', 'gen.text')).resolves.toEqual({
      model_id: 'example:model',
      pin,
    });
    expect(availability.requireCurrent).toHaveBeenCalledWith('example:model', 'gen.text', 'live');
  });

  it('resolves feature defaults only through the account-client seam', async () => {
    featureConfig.requireModel.mockResolvedValue('example:model');

    await expect(client.requireFeatureModel('agent', 'gen.text', 'demo')).resolves.toBe(
      'example:model',
    );
    expect(featureConfig.requireModel).toHaveBeenCalledWith('agent', {
      taskType: 'gen.text',
      executionMode: 'demo',
    });
  });

  it('projects available model reads through the seam', async () => {
    const models = [{ model_id: 'example:model' }];
    modelList.getAvailableModels.mockResolvedValue(models);

    await expect(
      client.getAvailableModels({
        taskType: 'gen.image',
        executionMode: 'demo',
      }),
    ).resolves.toBe(models);
    expect(modelList.getAvailableModels).toHaveBeenCalledWith({
      taskType: 'gen.image',
      executionMode: 'demo',
    });
  });

  it('projects model details through the seam without changing execution mode', async () => {
    const detail = { model_id: 'example:model' };
    modelList.getModelDetail.mockResolvedValue(detail);

    await expect(client.getModelDetail('example:model', 'demo')).resolves.toBe(detail);
    expect(modelList.getModelDetail).toHaveBeenCalledWith('example:model', 'demo');
  });

  it('projects native-currency estimates through the seam', () => {
    const detail = { model_id: 'example:model' };
    const estimate = { estimated_cost: 0.25, currency: 'CNY', breakdown: 'estimate' };
    modelList.estimateCost.mockReturnValue(estimate);

    expect(client.estimateCost(detail as never, { image_count: 1 }, 12)).toBe(estimate);
    expect(modelList.estimateCost).toHaveBeenCalledWith(detail, { image_count: 1 }, 12);
  });
});
