---
name: xgcanvas-stage-commits
description: Stage and commit XG Canvas work in logical phases. Use when the user asks to commit all changes, split commits, or prepare a branch history.
---

1. Inspect `git status --short`, `git diff --name-status`, and recent `git log --oneline`.
2. Do not use `git add .` blindly. Stage files by purpose and dependency order.
3. Prefer commit order: runtime/chore -> schema/contracts -> backend behavior -> frontend behavior -> docs/tests.
4. Keep unrelated user changes separate. If ownership is unclear, inspect the diff before staging.
5. Run `git diff --check` before committing when practical.
6. Use concise conventional commit messages with a clear scope.
7. After commits, report commit hashes and confirm whether the worktree is clean.

