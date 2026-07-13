import { validateProviderFile } from './manifest-validator';

function providerFile(inputContract: unknown) {
  return {
    version: '1',
    provider: { slug: 'test', display_name: 'Test' },
    models: [
      {
        model_id: 'test/model',
        provider_model_id: 'vendor-model',
        display_name: 'Model',
        task_types: ['image_generation'],
        input_contract: inputContract,
      },
    ],
  };
}

describe('validateProviderFile input_contract', () => {
  it('rejects invalid nested contracts with a field path', () => {
    const result = validateProviderFile(
      'test.yaml',
      providerFile({
        modes: [{ id: 'image_to_image', required_slots: [{ slot: 'x', type: 'url' }] }],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.failure.message).toContain('input_contract.modes.0.required_slots.0.type');
  });

  it('treats an empty contract as omitted', () => {
    expect(validateProviderFile('test.yaml', providerFile({})).ok).toBe(true);
  });
});
