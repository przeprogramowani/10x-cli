---
date: "2026-05-10T12:02:48Z"
researcher: Claude
git_commit: c9817b8737745b78c03b4a6f7be461972885deca
branch: master
repository: 10x-cli
topic: "Cross-platform e2e test coverage for CLI user flows"
tags: [research, codebase, testing, e2e, cross-platform, ci]
status: complete
last_updated: "2026-05-10"
last_updated_by: Claude
---

# Research: Cross-platform e2e test coverage for CLI user flows

**Date**: 2026-05-10T12:02:48Z
**Researcher**: Claude
**Git Commit**: c9817b8737745b78c03b4a6f7be461972885deca
**Branch**: master
**Repository**: 10x-cli

## Research Question

Do we have e2e tests that run the CLI from the user's perspective on both systems: Unix (macOS) and Windows? What infrastructure exists, what gaps remain, and what's the most pragmatic path to cross-platform e2e coverage?

## Summary

**No true e2e tests exist.** The project has strong unit/integration tests (22 test files) and Linux-only smoke tests (2 files), but nothing that exercises the CLI as a real subprocess with full argv/stdout/stderr/exit-code assertions the way a user would experience it. The Windows CI job skips smoke tests entirely, and macOS has no test CI at all.

The existing test infrastructure is well-designed for extension: cross-platform helpers already handle config isolation, binary naming, and env var differences. All four CLI commands (`auth`, `get`, `list`, `doctor`) are fully implemented and produce deterministic output suitable for subprocess assertions.

## Detailed Findings

### 1. Current Test Architecture

| Layer | Files | Platforms Tested | Approach |
|-------|-------|-----------------|----------|
| Unit/integration | `tests/*.test.ts` (22 files) | Ubuntu + Windows | In-process via `captureExit`/`captureStreams`, mock.module for API/clack |
| Smoke (binary) | `tests/smoke/binary.test.ts` | Ubuntu only | `Bun.spawnSync` on compiled binary — checks --version, --help, isolation, startup budget |
| Smoke (package) | `tests/smoke/package.test.ts` | Ubuntu only | `npm pack --dry-run`, auto-version.mjs in temp git repos |
| E2E (subprocess, user perspective) | **None** | **None** | — |

### 2. Test Helper Infrastructure

Four reusable helpers in `tests/helpers/`:

- **`config-isolation.ts`** — Redirects both `XDG_CONFIG_HOME` and `APPDATA` to temp dirs. Already cross-platform. Used in beforeEach/afterEach.
- **`auth-flow-mock.ts`** — Singleton mock for `src/lib/auth-flow`. Captures real references before `mock.module()` install. Falls through to real impl when null.
- **`clack-mock.ts`** — Mocks `@clack/prompts` (text, select, note). Records interactions for assertion.
- **`api-content-mock.ts`** — Mocks `src/lib/api-content` (fetchCatalog, fetchModules, fetchLesson, etc.).

Key patterns:
- `captureExit(fn)` → intercepts `process.exit()`, captures merged stdout+stderr → `{ exitCode?, captured }`
- `captureStreams(fn)` → same but separates stdout/stderr → `{ stdout, stderr, exitCode? }`
- CAC command execution: dynamic import after mocks, `cli.parse([...], { run: false })` then `await cli.runMatchedCommand()`

### 3. CLI Command Stability for E2E

All four commands are fully implemented (no stubs):

| Command | Auth Required | API Calls | Filesystem | Deterministic Output | E2E Classification |
|---------|--------------|-----------|------------|---------------------|-------------------|
| `10x auth --status` | No | No | Read-only | Yes | **e2e-ready** |
| `10x auth --logout` | No | No | Deletes auth.json | Yes | **e2e-ready** |
| `10x auth` (login) | No | Yes (login/verify) | Writes auth.json | Yes (with mock API) | e2e-possible |
| `10x doctor` | No | Yes (/health) | Read-only checks | Yes | **e2e-ready** |
| `10x list` | Yes | Yes (catalog) | None | Yes | e2e-possible |
| `10x get` | Yes | Yes (lesson) | Writes files | Yes (with --dry-run) | e2e-possible |

**Best candidates for first e2e tests** (no auth, no API needed):
1. `10x --version` — exit 0, stdout matches semver
2. `10x --help` — exit 0, outputs usage
3. `10x auth --status` (no auth file) — exit 3
4. `10x auth --logout` (no auth file) — exit 0
5. `10x doctor` (with mock /health via `API_BASE_URL=http://localhost:...`) — exit 0 or 78

### 4. CI Configuration Analysis

```
check (ubuntu-latest):
  typecheck → lint → test (unit) → build → build:binary → smoke tests

check-windows (windows-latest):
  install → test (unit only, PowerShell glob)
  SKIPS: typecheck, lint, build, build:binary, smoke

build-binaries (release only, 5 targets):
  builds for linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64
  NO tests on any produced binary
```

**Why Windows skips smoke tests**: The job never runs `bun run build:binary`, so `binary.test.ts` would fail at the existence check. This is an oversight, not a technical limitation — `bun build --compile` works on Windows (proven by `build-binaries` matrix entry `bun-windows-x64` on `windows-latest`).

**macOS**: No test CI at all. macOS runners cost 10x Linux ($0.08/min vs $0.008/min). A minimal unit-test-only job would cost ~$0.16-0.32 per PR run.

**Missed opportunity**: The `build-binaries` release job produces platform-specific binaries but never smoke-tests them. Adding `bun test tests/smoke/binary.test.ts` after `bun build --compile` would cost seconds and catch linking/compilation issues before release. Works for 3 of 5 targets (the 2 cross-compiled ARM targets cannot be natively tested).

### 5. Cross-Platform Handling Already In Place

**Handled correctly in source:**
- Config dir: `APPDATA` (Windows) vs `XDG_CONFIG_HOME`/`~/.config` (POSIX) — `src/lib/config.ts:36-44`
- File permissions: chmod 0o600 skipped on Windows — `src/lib/config.ts:84,106`
- Path safety: Rejects Windows reserved names (CON, NUL, COM1-9...), ADS, drive prefixes — `src/lib/writer.ts:435-463`
- All paths constructed with `path.join()`/`path.resolve()`, never concatenated with `/`

**Handled correctly in tests:**
- Binary naming: `process.platform === "win32" ? "10x.exe" : "10x"` — `tests/smoke/binary.test.ts:14`
- Env isolation: Both `XDG_CONFIG_HOME` and `APPDATA` redirected — `tests/helpers/config-isolation.ts`
- TTY override: `process.stdout.isTTY` controlled per-test
- Path assertions: Use `path.join()` not hardcoded slashes (fixed in commit `f05ee31`)

**Gaps:**
- `tests/fixtures/concurrency-child.ts` assumes POSIX O_APPEND atomicity
- No CRLF normalization in stream capture (could cause assertion failures on Windows if stdout contains \r\n)
- No testing of clipboard tools (pbcopy, clip.exe, xclip)

### 6. Proposed E2E Architecture

Based on this research, the e2e test suite should:

1. **Spawn the CLI as a real subprocess** using `Bun.spawnSync([BINARY_PATH, ...args], { stdout: "pipe", stderr: "pipe", env })` — the same pattern already proven in `binary.test.ts`
2. **Run in two modes**: against the compiled binary (`dist/10x`) and via `bun run dev --` (source mode)
3. **Use `API_BASE_URL=http://localhost:<port>`** for tests that need API interaction — spin up a tiny mock HTTP server in test setup
4. **Normalize line endings** in captured output before assertion: `.replace(/\r\n/g, "\n")`
5. **Live in `tests/e2e/`** — separate from unit tests, separate CI step
6. **Run on all three platforms** in CI (ubuntu, windows, macos)

## Code References

- `tests/helpers/config-isolation.ts` — Cross-platform config dir redirection
- `tests/helpers/auth-flow-mock.ts` — Singleton auth mock pattern
- `tests/helpers/api-content-mock.ts` — Singleton API mock pattern
- `tests/smoke/binary.test.ts:14-15` — Binary name + path resolution
- `tests/smoke/binary.test.ts:34-39` — Bun.spawnSync subprocess pattern
- `tests/smoke/binary.test.ts:58-71` — Isolation test (no node_modules, isolated HOME)
- `tests/exit-codes.test.ts:53-92` — captureExit in-process pattern (compare with subprocess approach)
- `src/lib/output.ts` — Output contract (JSON envelope, exit codes, stderr vs stdout)
- `src/lib/config.ts:36-44` — Cross-platform config dir resolution
- `.github/workflows/ci.yml:50-68` — Windows CI job (currently unit-only)
- `.github/workflows/ci.yml:122-162` — Release binary matrix (proves cross-compilation works)

## Architecture Insights

1. **The output contract is e2e-test-friendly by design.** JSON mode produces single-line deterministic envelopes. Exit codes are semantic. This means e2e tests can assert on `{ exitCode, parsedJson }` without fragile text matching.

2. **`API_BASE_URL` is the natural seam for e2e API mocking.** The allowlist accepts `http://localhost:<any-port>`, so a test-local HTTP server can serve canned responses. No module mocking needed at the subprocess level.

3. **The `--json` flag (or piped stdout) forces deterministic output.** Since subprocess stdout is always piped, JSON mode engages automatically — e2e tests get parseable output without passing `--json` explicitly.

4. **Config isolation via env vars works across process boundaries.** Unlike `mock.module()` which is in-process, `XDG_CONFIG_HOME`/`APPDATA` redirection works for subprocess testing too — just pass them in the spawn env.

5. **The 50ms startup budget test in smoke/binary.test.ts is fragile on CI.** GitHub Actions runners have variable performance. Consider a more generous budget (200ms) or skip timing tests on CI.

## Open Questions

1. **Should e2e tests run against compiled binary only, or also `bun run dev --`?** Binary tests catch bundling/compilation regressions; source-mode tests are faster to iterate on locally.
2. **Is a mock HTTP server worth the complexity for e2e, or should API-dependent commands be tested only at the unit/integration level?** A lightweight approach: test only auth-free commands in e2e (--version, --help, auth --status, auth --logout, doctor with unreachable API).
3. **macOS CI cost**: At 10x the rate, is per-PR macOS testing justified? Alternative: run macOS tests only on pushes to master, or only in the release pipeline.
4. **CRLF handling**: Do any commands produce `\r\n` on Windows? Need to verify by running existing smoke tests on Windows first.
5. **Startup budget on CI**: The 50ms budget may not hold on Windows/macOS runners. Should e2e skip or relax timing assertions?
