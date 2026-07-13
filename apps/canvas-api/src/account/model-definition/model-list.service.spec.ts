import { ModelListService } from './model-list.service';

describe('ModelListService input_contract boundary', () => {
  it('hides invalid historical rows and normalizes blank contracts', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([model('invalid', { modes: 'broken' }), model('blank', {})]),
    };
    const repository = { createQueryBuilder: jest.fn(() => query) };
    const credentials = {
      getProviderSlugsWithCredentials: jest.fn().mockResolvedValue(new Set(['test'])),
    };
    const service = new ModelListService(repository as never, credentials as never);

    const result = await service.getAvailableModels({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ model_id: 'blank', input_contract: undefined });
  });
});

function model(modelId: string, inputContract: unknown) {
  return {
    model_id: modelId,
    display_name: modelId,
    description: null,
    provider: { slug: 'test', display_name: 'Test', icon_url: null },
    task_types: [],
    capabilities: [],
    invocation_mode: 'sync',
    supports_streaming: false,
    tags: [],
    deprecated: false,
    deprecated_message: null,
    input_contract: inputContract,
    pricing: {},
  };
}
