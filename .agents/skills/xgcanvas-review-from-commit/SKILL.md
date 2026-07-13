---
name: xgcanvas-review-from-commit
description: Review XG Canvas changes from a given git commit onward, checking architecture alignment, docs drift, model/provider contracts, edge cases, and tests. Use when the user asks to review changes since a commit or compare against a baseline.
---

1. Identify the baseline commit and inspect `git diff --name-status <commit>...HEAD`.
2. Read root `AGENTS.md` plus directory `AGENTS.md` files relevant to changed paths.
3. Review in this order: architecture and module boundaries, data/schema changes, runtime behavior, frontend contract, docs/spec consistency, tests.
4. Treat user-intended new behavior as potentially valid. Do not revert it unless explicitly requested.
5. When code and docs conflict and intent is unclear, ask concise questions instead of guessing.
6. Report findings by severity with file/line references; include missing tests and edge cases.
7. If asked to fix, implement narrowly, run relevant checks, and summarize changed behavior.

