---
name: xgcanvas-provider-model
description: Add or modify XG Canvas providers, model YAML, adapters, model registry behavior, or generation model input contracts.
---

1. Read `docs/adapter-guide.md`, `docs/task-lifecycle.md`, and `config/model-providers/AGENTS.md`.
2. Keep adapter protocol logic in code and model declarations in YAML/DB registry.
3. For generation models, use canonical `inputs.mode`, `inputs.references[]`, and `params`.
4. Put structural inputs in `input_contract`; put vendor generation knobs in `param_schema` and `param_constraints`.
5. Update `packages/shared-types` vocabulary/types before using new task types, capabilities, modes, or slots.
6. Update config sync, manifest validation, API schema surfaces, frontend model types, and node forms together.
7. Add or update adapter request-builder tests for vendor-specific mapping.
8. Run targeted API tests/builds and verify YAML loads.

