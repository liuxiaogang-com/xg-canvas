import type { LibraryEntry } from '../database/entities';
import { presentLibraryEntry } from './library.presenter';

describe('presentLibraryEntry', () => {
  it('masks vendor ids and strips credential/verifier metadata', () => {
    const result = presentLibraryEntry({
      id: 'entry-1',
      kind: 'voice',
      scope: 'workspace',
      visibility: 'workspace',
      workspace_id: 'workspace-1',
      project_id: null,
      owner_id: 'user-1',
      name: 'Narrator',
      description: null,
      tags: [],
      cover_asset_id: null,
      material: null,
      provider_refs: [
        {
          binding_id: 'binding-1',
          provider: 'bailian',
          channel_id: 'channel-secret',
          credential_id: 'credential-secret',
          external_ref_id: 'voice-resource-123',
          status: 'ready',
          verified_params: { account: 'secret' },
        },
      ],
      deleted_at: new Date('2026-01-01T00:00:00.000Z'),
      created_at: new Date('2026-01-02T00:00:00.000Z'),
      updated_at: new Date('2026-01-03T00:00:00.000Z'),
    } as unknown as LibraryEntry);

    expect(result.provider_refs[0]).toEqual({
      binding_id: 'binding-1',
      provider: 'bailian',
      external_ref_id: 'voi***123',
      sample_asset_id: undefined,
      status: 'ready',
      verified_at: undefined,
    });
    expect(result.provider_refs[0]).not.toHaveProperty('credential_id');
    expect(result.provider_refs[0]).not.toHaveProperty('channel_id');
    expect(result.provider_refs[0]).not.toHaveProperty('verified_params');
    expect(result).not.toHaveProperty('deleted_at');
    expect(result.created_at).toBe('2026-01-02T00:00:00.000Z');
    expect(result.updated_at).toBe('2026-01-03T00:00:00.000Z');
  });
});
