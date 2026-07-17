import {
  ModelInputContractSchema,
  parseOptionalModelInputContract,
} from './model-input-contract.schema';

const validContract = {
  default_mode: 'image_to_video',
  modes: [
    {
      id: 'image_to_video',
      required_slots: [
        {
          slot: 'source_image',
          type: 'image',
          min: 1,
          max: 3,
          library: { kinds: ['character'], forms: ['material'] },
        },
      ],
    },
  ],
};

describe('ModelInputContractSchema', () => {
  it('accepts a valid mode and library slot contract', () => {
    expect(ModelInputContractSchema.safeParse(validContract).success).toBe(true);
  });

  it.each([
    [{ ...validContract, default_mode: 'missing' }, 'unknown default mode'],
    [
      {
        modes: [
          {
            id: 'image_to_video',
            required_slots: [{ slot: 'source_image', type: 'image' }],
            optional_slots: [{ slot: 'source_image', type: 'image' }],
          },
        ],
      },
      'duplicate slot',
    ],
    [
      {
        modes: [
          {
            id: 'image_to_video',
            required_slots: [{ slot: 'source_image', type: 'image', min: 2, max: 1 }],
          },
        ],
      },
      'inverted capacity',
    ],
    [
      {
        modes: [
          {
            id: 'image_to_video',
            required_slots: [
              {
                slot: 'source_image',
                type: 'image',
                library: { kinds: ['character', 'character'], forms: ['material'] },
              },
            ],
          },
        ],
      },
      'duplicate library kind',
    ],
  ])('rejects %s (%s)', (input, _label) => {
    expect(ModelInputContractSchema.safeParse(input).success).toBe(false);
  });

  it('accepts only omission as no contract', () => {
    expect(parseOptionalModelInputContract(undefined)).toEqual({ success: true, data: undefined });
    expect(parseOptionalModelInputContract({}).success).toBe(false);
    expect(parseOptionalModelInputContract(null).success).toBe(false);
  });

  it('rejects redundant required flags and invalid collection minima', () => {
    expect(
      ModelInputContractSchema.safeParse({
        modes: [
          {
            id: 'image_to_video',
            required_slots: [{ slot: 'source_image', type: 'image', required: false }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ModelInputContractSchema.safeParse({
        modes: [
          {
            id: 'image_to_video',
            required_slots: [{ slot: 'source_image', type: 'image', min: 0 }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ModelInputContractSchema.safeParse({
        modes: [
          {
            id: 'image_to_video',
            optional_slots: [{ slot: 'source_image', type: 'image', min: 1 }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
