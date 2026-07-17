import { assertStableCatalogOwner } from './catalog-owner';

describe('assertStableCatalogOwner', () => {
  it.each([
    ['channel_template', 'provider_uid'],
    ['model_offering', 'provider_uid'],
    ['rate_card', 'model_uid'],
  ])('prevents %s ownership from changing across revisions', (kind, ownerKey) => {
    expect(() =>
      assertStableCatalogOwner(
        { kind, [ownerKey]: '11111111-1111-4111-8111-111111111111' },
        { kind, [ownerKey]: '22222222-2222-4222-8222-222222222222' },
      ),
    ).toThrow(`owner ${ownerKey} cannot change`);
  });
});
