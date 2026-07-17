import { describe, expect, it } from 'vitest';
import {
  ModelInputContractSchema,
  parseOptionalModelInputContract,
} from './input-contract-schema';

describe('parseOptionalModelInputContract', () => {
  it('only treats an omitted contract as absent', () => {
    expect(parseOptionalModelInputContract(undefined)).toEqual({ success: true, data: undefined });
    expect(parseOptionalModelInputContract(null).success).toBe(false);
    expect(parseOptionalModelInputContract({}).success).toBe(false);
  });

  it('rejects duplicate modes and invalid default mode', () => {
    const result = parseOptionalModelInputContract({
      default_mode: 'missing',
      modes: [{ id: 'text_to_image' }, { id: 'text_to_image' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain('duplicate mode');
  });

  it('rejects unknown fields at every contract level', () => {
    expect(ModelInputContractSchema.safeParse({
      modes: [{
        id: 'image_to_image',
        required_slots: [{
          slot: 'source_image',
          type: 'image',
          required: true,
          library: { kinds: ['character'], forms: ['material'], typo: true },
        }],
      }],
      typo: true,
    }).success).toBe(false);
  });

  it('derives requiredness from the slot collection', () => {
    expect(ModelInputContractSchema.safeParse({
      modes: [{
        id: 'image_to_image',
        required_slots: [{ slot: 'source_image', type: 'image', min: 0 }],
      }],
    }).success).toBe(false);
    expect(ModelInputContractSchema.safeParse({
      modes: [{
        id: 'image_to_image',
        optional_slots: [{ slot: 'style_image', type: 'image', min: 1 }],
      }],
    }).success).toBe(false);
  });
});
