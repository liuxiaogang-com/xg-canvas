-- ============================================================
-- canvas schema · 015 — Fail closed on legacy provider bindings.
-- Provider-native resources are credential scoped; old JSON rows without
-- server-owned binding/channel/credential ids must never remain callable.
-- ============================================================
BEGIN;

UPDATE canvas.library_entries entry
   SET provider_refs = (
         SELECT COALESCE(
           jsonb_agg(
             CASE
               WHEN ref ? 'binding_id'
                AND ref ? 'channel_id'
                AND ref ? 'credential_id'
                AND COALESCE(ref ->> 'status', '') IN ('verifying', 'training', 'ready', 'failed', 'revoked')
               THEN ref
               ELSE jsonb_set(
                 jsonb_set(ref, '{status}', '"failed"'::jsonb, true),
                 '{error}',
                 '{"code":"LEGACY_BINDING_UNVERIFIED","message":"Binding must be re-verified for an exact credential"}'::jsonb,
                 true
               )
             END
             ORDER BY ordinal
           ),
           '[]'::jsonb
         )
           FROM jsonb_array_elements(entry.provider_refs) WITH ORDINALITY AS item(ref, ordinal)
       ),
       updated_at = NOW()
 WHERE EXISTS (
   SELECT 1
     FROM jsonb_array_elements(entry.provider_refs) AS item(ref)
    WHERE NOT (
      ref ? 'binding_id'
      AND ref ? 'channel_id'
      AND ref ? 'credential_id'
      AND COALESCE(ref ->> 'status', '') IN ('verifying', 'training', 'ready', 'failed', 'revoked')
    )
 );

COMMIT;
