import type { LibraryProviderRef, ResolvedGenerationReference } from '@xgcanvas/shared-types';

import { pickProviderRef, type ProviderRefCandidate } from './library-ref';

const candidate: ProviderRefCandidate = {
  provider: 'volcengine',
  channel_id: 'channel-a',
  credential_id: 'credential-a',
};

function reference(providerRefs: LibraryProviderRef[]): ResolvedGenerationReference {
  return {
    slot: 'driving_audio',
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
    provider: candidate.provider,
    channel_id: candidate.channel_id,
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
    ['provider', { provider: 'bailian' }],
    ['channel', { channel_id: 'channel-b' }],
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

  it('never consumes a legacy ready provider ref', () => {
    const legacy: LibraryProviderRef = {
      provider: candidate.provider,
      external_ref_id: 'legacy-voice',
      params: { credential_id: candidate.credential_id },
      status: 'ready',
    };

    expect(pickProviderRef(reference([legacy]), candidate)).toBeNull();
  });

  it('rejects a malformed binding without a server binding id', () => {
    expect(pickProviderRef(reference([readyBinding({ binding_id: undefined })]), candidate)).toBeNull();
  });

  it('accepts a verified binding when the provider has no extra parameters', () => {
    expect(pickProviderRef(reference([readyBinding({ verified_params: undefined })]), candidate))
      .toMatchObject({ binding_id: 'binding-a' });
  });
});
