# Contributing to XG Canvas

Thank you for helping build XG Canvas, an open-source, self-hosted AI creative
production platform for enterprise teams.

> **Contribution status:** XG Canvas is currently developed and maintained by its
> author. External code and documentation pull requests are not accepted at this
> stage. Please use GitHub Issues for bug reports, product feedback, deployment
> experience, and feature suggestions. Unsolicited pull requests will not be reviewed
> or merged unless a maintainer has explicitly requested the change in advance.

The project is currently in **Beta**. Product behavior, configuration, APIs, and
extension contracts may still change before the first stable release.

## One product, two licensing paths

XG Canvas does not maintain a feature-limited Community Edition. The complete public
Beta codebase is distributed under `AGPL-3.0-only`.

Organizations may also obtain a separate commercial license when they need proprietary
integration, private modifications, customer-specific branches, or contracted support.
Keeping both licensing paths available requires the project to have sufficient rights
to redistribute accepted contributions.

## Future contributor policy

Before external contributions open, the project will publish a legally reviewed
contribution agreement and acceptance process. This document describes the intended
engineering workflow only; it is not a current invitation to submit pull requests.

## Engineering rules

Project-wide conventions live in [`AGENTS.md`](../AGENTS.md), with more specific rules
in directory-level `AGENTS.md` files. Common requirements include:

1. Keep source files at or below 400 lines where practical; 500 lines is the hard cap.
2. Business modules reach models and vendors through the `account-client` seam.
3. Keep adapters code-first and the model registry compatible with YAML presets and
   database-managed models.
4. Persist long-running work as tasks and move generated assets into the configured
   XG Canvas object storage.
5. Use real SVG icon assets rather than emoji or pseudo-icons.
6. Update the authoritative specification under `docs/` whenever behavior changes.

## Development

Requirements:

- Node.js `>= 22.12`
- pnpm `>= 9`
- PostgreSQL
- Redis
- S3 / R2 compatible object storage

Typical local setup:

```bash
docker compose -f docker-compose.dev.yml up --build
```

No `.env` file or bootstrap secret is required for the development stack. It owns
PostgreSQL, Redis, migrations, the persistent encryption keyring, and the API/Web
processes. The first browser visit opens `/setup` to create the instance owner.

## Submitting a change when contributions open

1. Branch from `main`, which should remain runnable.
2. Keep the change focused and explain the reason in the commit message.
3. Add or update tests in proportion to the behavior changed.
4. Update the relevant specification and roadmap entry.
5. Run the build, lint, and tests for affected packages.
6. Open a pull request with the affected product area and verification results.

The steps above document the future contribution process and are not a current
invitation to submit pull requests. By submitting an explicitly requested contribution
for inclusion in XG Canvas, you agree that the public distribution is licensed under
AGPL-3.0-only and that the contribution is governed by the contribution terms in
effect when it is accepted.
