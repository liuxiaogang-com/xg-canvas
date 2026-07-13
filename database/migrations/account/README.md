# account migrations

Migrations for the `account` schema (providers / channels / credentials /
model_definitions / mappings / encryption_keys / audit_logs).

Owned by the account subsystem in [canvas-api](../../../apps/canvas-api/src/account).

| File | Purpose |
|---|---|
| `001_init_account_schema.sql` | Initial 4-layer model + audit + encryption key registry |

## Apply

```bash
psql "$DATABASE_URL" -f 001_init_account_schema.sql
```

(later replaced by TypeORM migrations after S1.5 integrates a data-source.)

## Conventions

- All tables live in the `account` schema (`CREATE SCHEMA IF NOT EXISTS account`)
- `param_schema` / `param_constraints` / `poll_policy` on `model_definitions` are
  **mirrors of YAML manifests under `config/model-providers/`**. Do not edit them
  in DB; edit YAML and call `POST /api/v1/admin/registry/reload`.
