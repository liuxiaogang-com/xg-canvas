# account migrations

The `account` schema owns the immutable Model Catalog history and its small
runtime configuration layer:

- Catalog sources, releases, resources, revisions, release entries, and runtime state
- provider installations, channel installations, and model settings
- credentials bound directly to a stable `channel_resource_uid`
- feature-to-model bindings, encryption keys, audit logs, and instance settings

Catalog revisions are the only structural source of truth. There are no
provider/channel/model projection tables, aliases, policy mirrors, or legacy
row-adoption paths.

## Apply

Run the repository migrator so schema generation and the permanent migration
ledger are checked together:

```bash
pnpm db:migrate
```

The current Beta baseline is generation 2 and accepts fresh databases only.
Existing pre-generation databases are rejected rather than inferred or
backfilled.
