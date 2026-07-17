import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const VALID_SCHEMAS = new Set(['account', 'canvas', 'ops']);
const schemas = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
for (const schema of schemas) {
  if (!VALID_SCHEMAS.has(schema)) {
    console.error(`Unknown migration schema: ${schema}`);
    process.exit(1);
  }
}
const requested = schemas.length ? new Set(schemas) : VALID_SCHEMAS;
const selected = [...VALID_SCHEMAS].filter((schema) => requested.has(schema));

const root = resolve('database', 'migrations');
const chunks = [
  String.raw`\set ON_ERROR_STOP on
SELECT pg_advisory_lock(hashtext('xgcanvas:schema-migrations'));
DO $generation_guard$
DECLARE current_generation integer;
BEGIN
  IF to_regclass('public.xgcanvas_schema_generation') IS NULL THEN
    IF to_regclass('public.xgcanvas_schema_migrations') IS NOT NULL
       OR EXISTS (
         SELECT 1
           FROM information_schema.tables
          WHERE table_schema IN ('account', 'canvas', 'ops')
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'UNSUPPORTED_SCHEMA_GENERATION: this Beta requires a fresh PostgreSQL database';
    END IF;
  ELSE
    EXECUTE 'SELECT generation FROM public.xgcanvas_schema_generation WHERE id = 1'
      INTO current_generation;
    IF current_generation IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'UNSUPPORTED_SCHEMA_GENERATION: expected generation 2';
    END IF;
  END IF;
END
$generation_guard$;
CREATE TABLE IF NOT EXISTS public.xgcanvas_schema_generation (
  id smallint PRIMARY KEY CHECK (id = 1),
  generation integer NOT NULL CHECK (generation > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.xgcanvas_schema_generation(id, generation)
VALUES (1, 2)
ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.xgcanvas_schema_migrations (
  migration_key text PRIMARY KEY,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
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
    const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
    chunks.push(String.raw`
DO $migration_checksum_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.xgcanvas_schema_migrations
     WHERE migration_key='${migrationKey}' AND checksum <> '${checksum}'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'MIGRATION_CHECKSUM_MISMATCH: ${migrationKey}';
  END IF;
END
$migration_checksum_guard$;
SELECT EXISTS(
  SELECT 1 FROM public.xgcanvas_schema_migrations WHERE migration_key='${migrationKey}'
) AS migration_applied \gset
\if :migration_applied
  \echo '==> skip ${migrationKey}'
\else
  \echo '==> apply ${migrationKey}'
  BEGIN;
${sql}
  INSERT INTO public.xgcanvas_schema_migrations (migration_key, checksum)
  VALUES ('${migrationKey}', '${checksum}');
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
  shell: false,
});
if (result.error) {
  console.error(`Failed to start psql: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

function stripOuterTransaction(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT);\s*$/i.test(line))
    .join('\n');
}
