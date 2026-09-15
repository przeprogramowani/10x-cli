# CLI quality checks

Install the CI development toolchain: Node 22, Bun 1.3.8, npm 11.12.1, then `bun install --frozen-lockfile`. These development requirements do not change the published CLI's Node >=20 engine. Runtime checks use only this checkout and its installed tools; no toolkit checkout or global TypeScript is needed.

| Command | Scope |
| --- | --- |
| `node .quality/run.mjs fast` | Changed JSON syntax and JS/TS Oxlint, read-only, maximum 30 seconds |
| `node .quality/run.mjs affected --base <SHA>` | Toolchain, runner regressions, types, lint, helper packaging validation and all top-level unit/integration tests |
| `node .quality/run.mjs gate` | All affected checks, Node build, standalone binary build and binary/package smoke tests |
| `node .quality/run.mjs risk` | Reports unavailable private release evidence; no production calls |

The `quality:*` Bun scripts call the same entry points. Without `--base`, changed paths are relative to HEAD and include index/worktree/untracked files. This single-package CLI conservatively checks its complete affected scope. Gate always runs anew, including in a clean checkout. `--check <id>` is a partial check and never issues a full gate receipt.

Existing Linux CI retains its native steps, matching every command in the local gate. The top-level Bun suite includes `tests/quality-loop.test.ts`, which runs the four real adapter regressions. Existing Windows Bun tests/builds/smoke remain native: quality-loop 1.0.0 process-group cancellation supports macOS/Linux. Existing helper validation and release evidence gates remain required. The runner does not send email, call models, publish packages or activate agent hooks. Private CLI/API coordinated evidence remains a separate release prerequisite.

Nonzero exits, missing tools, empty test discovery, zero passing tests, timeouts, busy locks and files changed during a run are incomplete results. Full logs and JSON receipts are in ignored `.quality-local/`; do not commit raw logs or use a historical receipt as today's proof. Source files are never autofixed. The gate retains existing Oxlint warnings and additionally rejects debugger statements and duplicate object keys.

The dependency-free runtime is a controlled copy of `@przeprogramowani/quality-loop` 1.0.0. `.quality/manifest.json` checks its hashes before execution; provenance is recorded in this change's source manifest. From an explicitly selected source package run `node sync.mjs /absolute/consumer` or add `--check` to compare bytes. The source package is separately prepared in Toolkit and has not yet landed on its master. The consumer is runnable without it. Updates require a reviewed source diff, matching runtime hashes and fresh gates. Revert the integration commit to remove it; no global configuration is installed.
