# canvas migrations

This directory holds migrations for the `canvas` schema (workspaces, projects,
canvases, nodes, edges, tasks, assets, presets, entities).

The initial schema is defined in `001_init_canvas_schema.sql`. Every task stores
an exact, non-null Catalog model revision pin and catalog epoch, and all tasks use
the real provider execution path.

Apply migrations through `pnpm db:migrate`. The current Beta baseline accepts
fresh generation-2 databases only. See
[architecture.md](../../../docs/architecture.md) for schema ownership and boundaries.
