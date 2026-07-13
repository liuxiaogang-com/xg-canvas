import { BadRequestException } from '@nestjs/common';

import { validatePublicTaskInputs } from './task-input.validator';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const LIBRARY_ID = '22222222-2222-4222-8222-222222222222';

describe('validatePublicTaskInputs', () => {
  it('accepts asset and library identifiers', () => {
    expect(() =>
      validatePublicTaskInputs({
        references: [
          { slot: 'source_image', type: 'image', asset_id: ASSET_ID },
          { slot: 'voice', type: 'library_ref', library_entry_id: LIBRARY_ID },
        ],
        audio_url: ASSET_ID,
      }),
    ).not.toThrow();
  });

  it.each(['http://127.0.0.1/private', 'https://example.test/ref.png', 'data:text/plain,payload'])(
    'rejects a raw reference URL: %s',
    (url) => {
      expectValidationFailure({
        references: [{ slot: 'source_image', type: 'image', asset_id: ASSET_ID, url }],
      });
    },
  );

  it('rejects a remote audio_url', () => {
    expectValidationFailure({ audio_url: 'http://169.254.169.254/latest/meta-data' });
  });

  it('rejects undeclared top-level fields so new adapters cannot reopen raw URL inputs', () => {
    expectValidationFailure({ image_url: 'https://attacker.test/image.png' });
    expectValidationFailure({ mask_url: ASSET_ID });
    expectValidationFailure({ messages: [{ role: 'user', content: [] }] });
  });

  it('bounds reference expansion and validates runtime reference types', () => {
    expectValidationFailure({
      references: Array.from({ length: 33 }, (_, order) => ({
        slot: 'reference_image',
        type: 'image',
        asset_id: ASSET_ID,
        order,
      })),
    });
    expectValidationFailure({
      references: [{ slot: 'source_image', type: 'future_url', asset_id: ASSET_ID }],
    });
  });

  it('rejects server-reserved library metadata', () => {
    expectValidationFailure({
      references: [
        {
          slot: 'voice',
          type: 'library_ref',
          library_entry_id: LIBRARY_ID,
          metadata: { library: { provider_refs: [{ external_ref_id: 'forged' }] } },
        },
      ],
    });
  });

  it('accepts the bounded prompt-mention provenance shape', () => {
    expect(() =>
      validatePublicTaskInputs({
        references: [
          {
            slot: 'source_image',
            type: 'image',
            asset_id: ASSET_ID,
            metadata: {
              source: 'prompt_mention',
              mention_id: 'mention-1',
              label: '角色 A',
              ref_kind: 'asset',
            },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('accepts a bounded library material-count hint but never adapter metadata', () => {
    expect(() =>
      validatePublicTaskInputs({
        references: [
          {
            slot: 'source_image',
            type: 'library_ref',
            library_entry_id: LIBRARY_ID,
            metadata: { cover_asset_id: ASSET_ID, material_asset_count: 3 },
          },
        ],
      }),
    ).not.toThrow();
    expectValidationFailure({
      references: [
        {
          slot: 'source_image',
          type: 'library_ref',
          library_entry_id: LIBRARY_ID,
          metadata: { material_asset_count: 0 },
        },
      ],
    });
    expectValidationFailure({
      references: [
        {
          slot: 'source_image',
          type: 'library_ref',
          library_entry_id: LIBRARY_ID,
          metadata: { material_asset_count: 1.5 },
        },
      ],
    });
  });

  it('requires exactly one public identifier', () => {
    expectValidationFailure({ references: [{ slot: 'source_image', type: 'image' }] });
    expectValidationFailure({
      references: [
        {
          slot: 'source_image',
          type: 'image',
          asset_id: ASSET_ID,
          library_entry_id: LIBRARY_ID,
        },
      ],
    });
  });
});

function expectValidationFailure(inputs: Record<string, unknown>): void {
  try {
    validatePublicTaskInputs(inputs);
    throw new Error('expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  }
}
