import { BadRequestException } from '@nestjs/common';

import { ModelDefinitionService } from './model-definition.service';

describe('ModelDefinitionService input_contract boundary', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const credentials = { getProviderSlugsWithCredentials: jest.fn() };
  const service = new ModelDefinitionService(repository as never, credentials as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(null);
  });

  it('rejects a non-blank invalid contract before writing', async () => {
    await expect(
      service.create({
        model_id: 'manual/model',
        input_contract: { modes: [{ id: 'image', required_slots: [{ slot: 'x', type: 'url' }] }] },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('normalizes a blank contract to the persisted no-contract shape', async () => {
    await service.create({ model_id: 'manual/model', input_contract: {} } as never);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ input_contract: {} }));
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
