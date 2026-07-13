import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const VALID_SCHEMAS = new Set(['account', 'canvas', 'ops']);
const schemas = process.argv.slice(2);
const selected = schemas.length ? schemas : ['account', 'canvas', 'ops'];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
for (const schema of selected) {
  if (!VALID_SCHEMAS.has(schema)) {
    console.error(`Unknown migration schema: ${schema}`);
    process.exit(1);
  }
}

const root = resolve('database', 'migrations');
// Before the ledger existed, db:migrate executed every file directly. Adopt only
// that last pre-ledger migration set when its durable schema marker is present.
// Newer migrations are never inferred: they must commit together with a ledger row.
const legacyBaselineSql = String.raw`
\echo '==> detect pre-ledger migration history'
INSERT INTO public.xgcanvas_schema_migrations (migration_key)
SELECT migration_key
FROM (
  SELECT 'account/001_init_account_schema.sql' AS migration_key
  WHERE to_regclass('account.providers') IS NOT NULL
  UNION ALL
  SELECT 'account/002_feature_model_config.sql'
  WHERE to_regclass('account.feature_model_configs') IS NOT NULL
  UNION ALL
  SELECT 'account/003_model_input_contract.sql'
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='account' AND table_name='model_definitions' AND column_name='input_contract'
  )
  UNION ALL
  SELECT 'canvas/001_init_canvas_schema.sql'
  WHERE to_regclass('canvas.users') IS NOT NULL
  UNION ALL
  SELECT 'canvas/002_chat_schema.sql'
  WHERE to_regclass('canvas.conversations') IS NOT NULL
  UNION ALL
  SELECT 'canvas/003_session_schema.sql'
  WHERE to_regclass('canvas.auth_sessions') IS NOT NULL
  UNION ALL
  SELECT 'canvas/004_identity_schema.sql'
  WHERE to_regclass('canvas.auth_identities') IS NOT NULL
  UNION ALL
  SELECT 'canvas/005_authz_schema.sql'
  WHERE to_regclass('canvas.roles') IS NOT NULL
  UNION ALL
  SELECT 'canvas/006_edge_unique.sql'
  WHERE EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='uk_edge_endpoints' AND conrelid=to_regclass('canvas.canvas_edges')
  )
  UNION ALL
  SELECT 'canvas/007_drop_session_role.sql'
  WHERE to_regclass('canvas.auth_sessions') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='canvas' AND table_name='auth_sessions' AND column_name='role'
    )
  UNION ALL
  SELECT 'ops/001_init_ops_schema.sql'
  WHERE to_regclass('ops.request_logs') IS NOT NULL
  UNION ALL
  SELECT 'ops/002_request_log_cost.sql'
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ops' AND table_name='request_logs' AND column_name='cost'
  )
) detected
ON CONFLICT (migration_key) DO NOTHING;
`;
const chunks = [
  String.raw`\set ON_ERROR_STOP on
CREATE TABLE IF NOT EXISTS public.xgcanvas_schema_migrations (
  migration_key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT pg_advisory_lock(hashtext('xgcanvas:schema-migrations'));
${legacyBaselineSql}
`,
];

for (const schema of selected) {
  const dir = join(root, schema);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const migrationKey = `${schema}/${basename(file)}`;
    const sql = stripOuterTransaction(readFileSync(file, 'utf8'));
    chunks.push(String.raw`
SELECT EXISTS(
  SELECT 1 FROM public.xgcanvas_schema_migrations WHERE migration_key='${migrationKey}'
) AS migration_applied \gset
\if :migration_applied
  \echo '==> skip ${migrationKey}'
\else
  \echo '==> apply ${migrationKey}'
  BEGIN;
${sql}
  INSERT INTO public.xgcanvas_schema_migrations (migration_key) VALUES ('${migrationKey}');
  COMMIT;
\endif
`);
  }
}
chunks.push(`SELECT pg_advisory_unlock(hashtext('xgcanvas:schema-migrations'));\n`);

const result = spawnSync('psql', [databaseUrl], {
  input: chunks.join('\n'),
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

function stripOuterTransaction(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT);\s*$/i.test(line))
    .join('\n');
}
