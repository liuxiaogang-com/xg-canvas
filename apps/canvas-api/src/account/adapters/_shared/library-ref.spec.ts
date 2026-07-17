import type { LibraryProviderRef, ResolvedGenerationReference } from '@xgcanvas/shared-types';

import { pickProviderRef, type ProviderRefCandidate } from './library-ref';

const candidate: ProviderRefCandidate = {
  provider_resource_uid: '11111111-1111-4111-8111-111111111111',
  channel_resource_uid: '22222222-2222-4222-8222-222222222222',
  credential_id: 'credential-a',
};

function reference(providerRefs: LibraryProviderRef[]): ResolvedGenerationReference {
  return {
    slot: 'driving_audio',
    type: 'library_ref',
    metadata: {
      library: {
        entry_id: 'entry-a',
        kind: 'voice',
        name: 'Voice A',
        provider_refs: providerRefs,
      },
    },
  };
}

function readyBinding(overrides: Partial<LibraryProviderRef> = {}): LibraryProviderRef {
  return {
    binding_id: 'binding-a',
    provider_resource_uid: candidate.provider_resource_uid,
    channel_resource_uid: candidate.channel_resource_uid,
    credential_id: candidate.credential_id,
    external_ref_id: 'voice-a',
    verified_params: { language: 'zh' },
    status: 'ready',
    ...overrides,
  };
}

describe('pickProviderRef', () => {
  it('returns only the exact ready provider, channel, and credential binding', () => {
    expect(pickProviderRef(reference([readyBinding()]), candidate)).toEqual(readyBinding());
  });

  it.each([
    ['provider', { provider_resource_uid: '33333333-3333-4333-8333-333333333333' }],
    ['channel', { channel_resource_uid: '44444444-4444-4444-8444-444444444444' }],
    ['credential', { credential_id: 'credential-b' }],
  ])('rejects a binding for a different %s', (_name, overrides) => {
    expect(pickProviderRef(reference([readyBinding(overrides)]), candidate)).toBeNull();
  });

  it.each(['verifying', 'training', 'failed', 'revoked'] as const)(
    'rejects a %s binding',
    (status) => {
      expect(pickProviderRef(reference([readyBinding({ status })]), candidate)).toBeNull();
    },
  );

  it('rejects a malformed binding without a server binding id', () => {
    expect(
      pickProviderRef(reference([readyBinding({ binding_id: undefined })]), candidate),
    ).toBeNull();
  });

  it('accepts a verified binding when the provider has no extra parameters', () => {
    expect(
      pickProviderRef(reference([readyBinding({ verified_params: undefined })]), candidate),
    ).toMatchObject({ binding_id: 'binding-a' });
  });
});
