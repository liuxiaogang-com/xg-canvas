import { AdapterError } from '@xgcanvas/adapters-contract';

import { normalizeInputsForContract, validateInputContract } from './input-contract.validator';

describe('input contract validator', () => {
  const contract = {
    default_mode: 'image_to_video',
    modes: [
      {
        id: 'image_to_video',
        required_slots: [{ slot: 'source_image', type: 'image' as const, min: 1, max: 1 }],
      },
      {
        id: 'first_last_frame',
        required_slots: [
          { slot: 'first_frame', type: 'image' as const, min: 1, max: 1 },
          { slot: 'last_frame', type: 'image' as const, min: 1, max: 1 },
        ],
      },
    ],
  };

  it('fills the default mode', () => {
    expect(normalizeInputsForContract({ prompt: 'go' }, contract).mode).toBe('image_to_video');
  });

  it('accepts required slots', () => {
    expect(() =>
      validateInputContract(contract, {
        mode: 'image_to_video',
        references: [{ slot: 'source_image', type: 'image', url: 'https://assets.test/a.png' }],
      }),
    ).not.toThrow();
  });

  it('rejects missing required slots', () => {
    expect(() => validateInputContract(contract, { mode: 'first_last_frame', references: [] })).toThrow(AdapterError);
  });

  it('rejects too many references for a slot', () => {
    expect(() =>
      validateInputContract(contract, {
        mode: 'image_to_video',
        references: [
          { slot: 'source_image', type: 'image', url: 'https://assets.test/a.png' },
          { slot: 'source_image', type: 'image', url: 'https://assets.test/b.png' },
        ],
      }),
    ).toThrow(AdapterError);
  });

  it('rejects mismatched reference types', () => {
    expect(() =>
      validateInputContract(contract, {
        mode: 'image_to_video',
        references: [{ slot: 'source_image', type: 'audio', url: 'https://assets.test/a.wav' }],
      }),
    ).toThrow(AdapterError);
  });

  it('enforces declared library kinds and material forms', () => {
    const libraryContract = {
      default_mode: 'image_to_video',
      modes: [{
        id: 'image_to_video',
        required_slots: [{
          slot: 'source_image',
          type: 'image' as const,
          library: { kinds: ['character'], forms: ['material' as const] },
        }],
      }],
    };
    const material = {
      slot: 'source_image',
      type: 'image' as const,
      url: 'https://assets.test/a.png',
      metadata: { library: { kind: 'character', provider_refs: [] } },
    };
    expect(() => validateInputContract(libraryContract, { references: [material] })).not.toThrow();
    expect(() => validateInputContract(libraryContract, {
      references: [{ ...material, metadata: { library: { kind: 'voice', provider_refs: [] } } }],
    })).toThrow(AdapterError);
  });

  it('rejects library metadata on a slot without a library contract', () => {
    expect(() => validateInputContract(contract, {
      references: [{
        slot: 'source_image',
        type: 'image',
        url: 'https://assets.test/a.png',
        metadata: { library: { kind: 'character', provider_refs: [] } },
      }],
    })).toThrow(AdapterError);
  });
});
