---
name: xgcanvas-doc-sync
description: Synchronize XG Canvas docs/specs with code behavior. Use when code changes architecture, API contracts, nodes, adapters, task lifecycle, presets, or model registry semantics.
---

1. Identify the behavior change and map it to the authoritative spec file under `docs/`.
2. Update the spec before or alongside code, not as a loose summary.
3. Remove obsolete service names, fields, endpoints, and topology from docs when code removes them.
4. Keep docs focused on current intended behavior. Avoid temporary notes unless they are tracked in todo/deferred-work.
5. If docs and code conflict and user intent is ambiguous, ask the user to choose; after confirmation, update docs directly.
6. Check changed docs for consistency with root and directory `AGENTS.md`.
