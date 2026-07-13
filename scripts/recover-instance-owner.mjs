import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
const email = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();
const confirmed = process.argv.includes('--confirm');

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!email || email.length > 320 || !email.includes('@') || !confirmed) {
  console.error('Usage: pnpm recover:instance-owner -- <existing-email> --confirm');
  process.exit(1);
}

const sql = String.raw`\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('xgcanvas:instance-setup'));

SELECT u.id AS recovery_user_id
FROM canvas.users u
WHERE u.status='active'
  AND u.merged_into_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM canvas.auth_identities i
    WHERE i.user_id=u.id
      AND i.provider IN ('email','password')
      AND i.provider_uid=lower(:'owner_email')
  )
ORDER BY u.created_at, u.id
LIMIT 1
\gset

\if :{?recovery_user_id}
  UPDATE canvas.users
     SET is_instance_owner=false
   WHERE is_instance_owner=true AND id <> :'recovery_user_id'::uuid;
  UPDATE canvas.users
     SET is_instance_owner=true
   WHERE id=:'recovery_user_id'::uuid;
  INSERT INTO account.instance_setup (id, owner_user_id, completed_at)
  VALUES (1, :'recovery_user_id'::uuid, now())
  ON CONFLICT (id) DO UPDATE
    SET owner_user_id=EXCLUDED.owner_user_id,
        completed_at=EXCLUDED.completed_at,
        updated_at=now();
  COMMIT;
  \echo 'Instance owner recovery completed.'
\else
  ROLLBACK;
  \echo 'No active, unmerged user matches that email.'
  \quit 3
\endif
`;

const result = spawnSync(
  'psql',
  [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-v', `owner_email=${email}`],
  {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
