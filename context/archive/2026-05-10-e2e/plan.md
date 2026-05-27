# Cross-Platform E2E Tests Implementation Plan

## Overview

Add end-to-end tests that exercise the compiled CLI binary as a real subprocess against the production API, with automated magic-link email verification via the Resend API. Tests run on Ubuntu and Windows in CI as separate jobs that gate the release pipeline.

## Current State Analysis

The project has 22 unit/integration test files and 2 Linux-only smoke tests, but no true e2e coverage that exercises the CLI as a user would: spawning the binary, passing argv, and asserting on stdout/stderr/exit-code. The `check-windows` CI job skips smoke tests entirely. The `docs/reference/platform-support.md` documents e2e jobs that don't exist yet.

### Key Discoveries:

- `tests/smoke/binary.test.ts:34-39` — proven `Bun.spawnSync` pattern for subprocess testing, already cross-platform (handles `10x.exe` naming)
- `src/lib/api-client.ts` — `API_BASE_URL` env var is NOT usable for pointing at localhost (strict allowlist); tests must hit the real production API
- The edu-platform's `ResendMagicLinks` class (at `~/code/przeprogramowani-sites/projects/edu-platform/tests/e2e/support/resendMagicLinks.ts`) provides the polling pattern: fetch last 50 emails, filter by recipient + creation time, extract verify URL from HTML
- Auth flow: CLI calls `POST /auth/login` → backend sends email → CLI polls `GET /auth/verify?session=<id>` every 2s for 5min → user clicks link (`GET /auth/callback?token=X&session=Y`) → poll succeeds with TokenBundle
- JSON mode auto-engages when stdout is piped (which subprocess tests always do)

## Desired End State

A `tests/e2e/` directory containing tests that spawn the compiled `dist/10x` binary as a child process, exercise every command (auth, list, get, doctor) against the real production API, and pass on both Ubuntu and Windows in CI. Auth is automated via Resend API email retrieval. The CI workflow includes separate `e2e` and `e2e-windows` jobs that run after the binary is built, with GitHub secrets for the Resend API key and test email.

### Verification:

- `bun test tests/e2e/` passes locally with `.env.test` providing `E2E_RESEND_API_KEY` and `E2E_TEST_EMAIL`
- CI `e2e` job (ubuntu) passes on PRs
- CI `e2e-windows` job (windows) passes on PRs
- All tests exercise the compiled binary, not source mode
- Tests complete within 90s total (60s timeout per test, auth flow is the bottleneck)

## What We're NOT Doing

- macOS CI (skipped per decision — Ubuntu + Windows only)
- Mock HTTP server (using real production API)
- Source-mode testing (compiled binary only)
- Playwright or any browser-based framework (Bun test runner + Bun.spawn)
- Changing the existing smoke tests or unit tests
- Testing clipboard functionality (platform-dependent, low-value)

## Implementation Approach

Adapt the edu-platform's Resend-based magic-link retrieval pattern for CLI subprocess testing. Tests use `Bun.spawn` (async) for the auth flow (CLI blocks while polling) and `Bun.spawnSync` for all other commands. A shared setup phase authenticates once and writes `auth.json` to an isolated config dir; subsequent tests inherit that config via env vars.

## Critical Implementation Details

**Timing & lifecycle**: The auth e2e test must use async `Bun.spawn` (not `spawnSync`) because the CLI blocks while polling for email verification. The test needs to concurrently: (a) wait for the CLI to trigger the email, (b) poll Resend for the email, (c) hit the callback URL to complete verification, (d) wait for the CLI to exit. This is a coordinated async dance — the CLI won't exit until the callback is hit, and the callback can't be hit until the email arrives.

---

## Phase 1: E2E Infrastructure

### Overview

Create the test harness: a subprocess spawn helper, output normalization, Resend magic-link utility, environment configuration, and the test file skeleton.

### Changes Required:

#### 1. E2E environment configuration

**File**: `tests/e2e/.env.test.example`

**Intent**: Document the required environment variables for running e2e tests locally. Gitignored `.env.test` will hold real values.

**Contract**: Three env vars: `E2E_RESEND_API_KEY` (Resend API key with read access), `E2E_TEST_EMAIL` (the test account email, e.g. `smoke-test@przeprogramowani.pl`), `E2E_INBOX_EMAIL` (where emails actually land in DEV mode, if different).

#### 2. Subprocess spawn helper

**File**: `tests/e2e/support/cli.ts`

**Intent**: Provide a typed wrapper around `Bun.spawnSync` and `Bun.spawn` that handles binary path resolution, env isolation (config dir + HOME), output normalization (CRLF → LF), and JSON parsing. All e2e tests call through this helper instead of raw Bun.spawn.

**Contract**:
```typescript
interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: <T>() => T; // parse stdout as JSON, throw if invalid
}

function runCli(args: string[], options?: { env?: Record<string, string>; timeout?: number }): CliResult;
function spawnCli(args: string[], options?: { env?: Record<string, string> }): { proc: Subprocess; result: Promise<CliResult> };
```

The helper resolves binary path from `dist/10x` (or `dist/10x.exe` on Windows), injects `XDG_CONFIG_HOME`/`APPDATA` pointing at a per-test temp dir, sets `NO_COLOR=1`, and normalizes `\r\n` → `\n` in captured output.

#### 3. Resend magic-link utility

**File**: `tests/e2e/support/resend-magic-links.ts`

**Intent**: Adapt the edu-platform's `ResendMagicLinks` class for CLI e2e tests. Polls the Resend "list sent emails" API, filters by recipient and creation time, retrieves the email HTML, and extracts the `/auth/callback?token=X&session=Y` URL.

**Contract**: Mirrors the edu-platform pattern:
```typescript
class ResendMagicLinks {
  constructor(apiKey: string);
  findCallbackUrl(options: { recipientEmail: string; sentAfter: Date; timeoutMs?: number; pollIntervalMs?: number }): Promise<string>;
}
```

Default timeout 30s, poll interval 500ms. On timeout, throws with diagnostic info (poll count, last API error). Uses native `fetch` (no Resend SDK dependency).

#### 4. Environment loader

**File**: `tests/e2e/support/env.ts`

**Intent**: Load and validate e2e environment variables, with graceful skip when secrets are missing (allows contributors to run auth-free tests without the Resend key).

**Contract**: Exports `e2eEnv` object with typed fields. Exports `hasAuthSecrets(): boolean` for tests to skip auth-dependent flows.

#### 5. Gitignore update

**File**: `.gitignore`

**Intent**: Add `tests/e2e/.env.test` to prevent accidental secret commits.

**Contract**: Append line `tests/e2e/.env.test`.

### Success Criteria:

#### Automated Verification:

- `bun run typecheck` passes with new files
- `bun run lint` passes
- `tests/e2e/support/cli.ts` compiles and resolves binary path correctly
- `tests/e2e/support/resend-magic-links.ts` compiles

#### Manual Verification:

- Running `bun test tests/e2e/` with no test files yet produces no errors (empty suite)
- The `.env.test.example` file documents all required variables clearly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Auth-Free E2E Tests

### Overview

Test commands that don't require authentication or API access. These validate the output contract (JSON envelopes, exit codes, stderr vs stdout) and prove the e2e harness works end-to-end.

### Changes Required:

#### 1. Global flags test file

**File**: `tests/e2e/global-flags.test.ts`

**Intent**: Test `--version`, `--help`, and unknown-command handling as a subprocess. These are the simplest possible e2e tests and validate the harness.

**Contract**: Tests assert:
- `10x --version` → exit 0, stdout matches `/\d+\.\d+\.\d+/`
- `10x --help` → exit 0, output contains "10x" and command names
- `10x nonexistent` → exit 2 (USAGE), stderr contains "ERROR"
- `10x --unknown-flag` → exit 2 (USAGE)

#### 2. Auth status/logout without credentials

**File**: `tests/e2e/auth-no-credentials.test.ts`

**Intent**: Test auth subcommands when no auth.json exists (isolated config dir).

**Contract**: Tests assert:
- `10x auth --status --json` → exit 3 (AUTH_REQUIRED), JSON envelope `{ status: "error", error: { code: "not_authenticated" } }`
- `10x auth --logout --json` → exit 0, JSON envelope `{ status: "ok", data: { logged_out: true, had_credentials: false } }`

### Success Criteria:

#### Automated Verification:

- `bun test tests/e2e/global-flags.test.ts` passes (requires `bun run build:binary` first)
- `bun test tests/e2e/auth-no-credentials.test.ts` passes
- `bun run typecheck` passes
- `bun run lint` passes

#### Manual Verification:

- Tests produce clear failure messages when binary doesn't exist
- Tests pass on both macOS (local) and would pass on Windows (path handling, CRLF)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Auth Flow E2E Test

### Overview

Test the full magic-link login flow by running `10x auth --email <test-email> --json` as an async subprocess, concurrently retrieving the verification email via Resend, and hitting the callback URL to complete authentication.

### Changes Required:

#### 1. Auth flow e2e test

**File**: `tests/e2e/auth-flow.test.ts`

**Intent**: Exercise the complete authentication flow as a user would experience it. The test spawns the CLI (which starts polling), waits for the Resend email to arrive, hits the callback URL to verify, then asserts the CLI exits with success and writes valid auth.json.

**Contract**: 
- Uses `spawnCli` (async) to run `10x auth --email <E2E_TEST_EMAIL> --json`
- Concurrently calls `resendMagicLinks.findCallbackUrl(...)` to retrieve the magic link
- Hits the callback URL via `fetch(callbackUrl)` 
- Awaits CLI process exit
- Asserts: exit 0, JSON output contains `email` field, auth.json written to isolated config dir
- Test timeout: 60s
- Skips if `!hasAuthSecrets()` (no Resend key available)

#### 2. Auth setup fixture for subsequent tests

**File**: `tests/e2e/support/auth-setup.ts`

**Intent**: Provide a reusable function that performs the auth flow and returns the path to a valid auth.json. Subsequent tests use this to get authenticated config without repeating the email dance.

**Contract**:
```typescript
async function authenticateTestUser(configDir: string): Promise<void>;
```

Performs the same flow as the auth test (spawn CLI, poll Resend, hit callback) but as a setup utility. Writes auth.json to `configDir`. Throws if auth fails within 60s. Can be called once in a `beforeAll` for the authenticated test suite.

### Success Criteria:

#### Automated Verification:

- `bun test tests/e2e/auth-flow.test.ts` passes with valid `E2E_RESEND_API_KEY`
- Auth.json is written to the isolated config dir with valid tokens
- `bun run typecheck` passes
- `bun run lint` passes

#### Manual Verification:

- The magic-link email arrives at the test inbox within 10s
- The Resend polling finds the email and extracts the callback URL
- The CLI exits cleanly after callback is hit (no hanging process)
- Running twice in sequence doesn't conflict (isolated config dirs)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Authenticated Command Tests

### Overview

Test `doctor`, `list`, and `get --dry-run` against the real production API using auth credentials from the setup fixture.

### Changes Required:

#### 1. Doctor e2e test

**File**: `tests/e2e/doctor.test.ts`

**Intent**: Test `10x doctor --json` with valid auth. Asserts all 5 checks run, API connectivity check passes, auth check passes.

**Contract**:
- Uses `authenticateTestUser()` in `beforeAll` to get valid auth
- `10x doctor --json` → exit 0, JSON contains `overall: "ok"` or specific check results
- Auth check shows the test email
- API check shows latency measurement
- Skips if `!hasAuthSecrets()`

#### 2. List e2e test

**File**: `tests/e2e/list.test.ts`

**Intent**: Test `10x list --json` and `10x list 1 --json` against real catalog data.

**Contract**:
- `10x list --json` → exit 0, JSON contains modules array with expected structure
- `10x list 1 --json` → exit 0, JSON contains lessons array for module 1
- `10x list 99 --json` → exit 5 (NOT_FOUND) or exit 2 (USAGE, out of range)
- Skips if `!hasAuthSecrets()`

#### 3. Get (dry-run) e2e test

**File**: `tests/e2e/get.test.ts`

**Intent**: Test `10x get m1l1 --dry-run --json` to verify the full fetch+signature pipeline without writing files.

**Contract**:
- `10x get m1l1 --dry-run --json` → exit 0, JSON contains `writeResults` with file paths and `action: "created"` (dry-run simulates)
- `10x get m99l99 --json` → exit 5 (NOT_FOUND)
- `10x get m1l1 --dry-run --type skills --json` → exit 0, filtered to skills only
- Skips if `!hasAuthSecrets()`

### Success Criteria:

#### Automated Verification:

- `bun test tests/e2e/doctor.test.ts` passes with valid auth
- `bun test tests/e2e/list.test.ts` passes with valid auth
- `bun test tests/e2e/get.test.ts` passes with valid auth
- `bun run typecheck` passes
- `bun run lint` passes

#### Manual Verification:

- Doctor reports real API latency (proves it hit production)
- List returns real module data matching current course state
- Get dry-run shows real lesson artifacts (skills, prompts, rules)
- No test modifies any file outside its isolated temp dir

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: CI Workflow

### Overview

Add `e2e` and `e2e-windows` CI jobs that build the binary and run e2e tests with GitHub secrets. Also extend `check-windows` to run existing smoke tests.

### Changes Required:

#### 1. E2E CI jobs

**File**: `.github/workflows/ci.yml`

**Intent**: Add two new jobs (`e2e` on ubuntu-latest, `e2e-windows` on windows-latest) that build the binary and run e2e tests. These jobs are separate from `check` so flakiness doesn't block the fast feedback loop. They run after `check` passes (needs dependency).

**Contract**:
- Both jobs: checkout → setup-bun → install → `bun run build:binary` → `bun test tests/e2e/`
- Environment secrets: `E2E_RESEND_API_KEY`, `E2E_TEST_EMAIL`, `E2E_INBOX_EMAIL`
- Test timeout: 120s per job
- `e2e-windows` uses `shell: pwsh` and PowerShell-compatible commands
- Jobs depend on `check` (ubuntu) / `check-windows` respectively

#### 2. Extend check-windows with smoke tests

**File**: `.github/workflows/ci.yml`

**Intent**: Add `bun run build:binary` and `bun test tests/smoke/` steps to the existing `check-windows` job. The binary smoke tests already handle Windows (`10x.exe` naming, `USERPROFILE` env var).

**Contract**: After the existing unit test step, add:
- `bun run build` (produces dist/index.mjs)
- `bun run build:binary` (produces dist/10x.exe)
- `bun test tests/smoke/` (runs binary + package smoke tests)

#### 3. Update platform-support.md

**File**: `docs/reference/platform-support.md`

**Intent**: Update the CI testing table to accurately reflect the new e2e jobs (currently documents non-existent jobs).

**Contract**: Update the table to show `e2e` and `e2e-windows` jobs with accurate descriptions of what they test.

### Success Criteria:

#### Automated Verification:

- CI `check` job still passes (no regression)
- CI `check-windows` job passes including new smoke test steps
- CI `e2e` job passes on ubuntu-latest
- CI `e2e-windows` job passes on windows-latest

#### Manual Verification:

- GitHub Actions shows the new jobs in the workflow graph
- E2E jobs use secrets correctly (no exposure in logs)
- A failing e2e test doesn't block the `check` job (independent)
- Re-running a failed e2e job doesn't require re-running unit tests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No new unit tests needed — this change IS the test infrastructure

### Integration Tests:

- The e2e tests themselves are the integration layer

### E2E Tests (this change):

- `tests/e2e/global-flags.test.ts` — version, help, unknown command
- `tests/e2e/auth-no-credentials.test.ts` — auth status/logout without creds
- `tests/e2e/auth-flow.test.ts` — full magic-link login flow
- `tests/e2e/doctor.test.ts` — diagnostic checks
- `tests/e2e/list.test.ts` — catalog listing
- `tests/e2e/get.test.ts` — lesson fetch (dry-run)

### Manual Testing Steps:

1. Build binary: `bun run build:binary`
2. Run auth-free tests: `bun test tests/e2e/global-flags.test.ts tests/e2e/auth-no-credentials.test.ts`
3. Set up `.env.test` with Resend key
4. Run full suite: `bun test tests/e2e/`
5. Verify on Windows (if available): same steps produce same results

## Performance Considerations

- Auth flow test is inherently slow (~10-30s for email delivery + polling)
- All other tests are fast (<1s each since they use spawnSync)
- CI timeout per job: 120s (generous for auth flow + 5 fast tests)
- Serial execution within auth tests to avoid email inbox conflicts
- Parallel execution safe for auth-free tests

## References

- Related research: `context/changes/e2e/research.md`
- Edu-platform pattern: `~/code/przeprogramowani-sites/projects/edu-platform/tests/e2e/support/resendMagicLinks.ts`
- Existing smoke test: `tests/smoke/binary.test.ts`
- Auth flow source: `src/lib/auth-flow.ts`
- Output contract: `src/lib/output.ts`
- CI workflow: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: E2E Infrastructure

#### Automated

- [x] 1.1 Typecheck passes with new support files — 40454c4
- [x] 1.2 Lint passes with new support files — 40454c4

#### Manual

- [ ] 1.3 Empty test suite runs without errors
- [ ] 1.4 .env.test.example documents all variables clearly

### Phase 2: Auth-Free E2E Tests

#### Automated

- [x] 2.1 global-flags.test.ts passes after build:binary — 9ec3798
- [x] 2.2 auth-no-credentials.test.ts passes — 9ec3798
- [x] 2.3 Typecheck passes — 9ec3798
- [x] 2.4 Lint passes — 9ec3798

#### Manual

- [ ] 2.5 Tests produce clear failure messages when binary missing
- [ ] 2.6 Tests handle CRLF normalization correctly

### Phase 3: Auth Flow E2E Test

#### Automated

- [x] 3.1 auth-flow.test.ts passes with valid Resend key — d97ed75
- [x] 3.2 Auth.json written with valid tokens — d97ed75
- [x] 3.3 Typecheck passes — d97ed75
- [x] 3.4 Lint passes — d97ed75

#### Manual

- [ ] 3.5 Email arrives within 10s
- [ ] 3.6 CLI exits cleanly after callback hit
- [ ] 3.7 Sequential runs don't conflict

### Phase 4: Authenticated Command Tests

#### Automated

- [x] 4.1 doctor.test.ts passes — b12e8ff
- [x] 4.2 list.test.ts passes — b12e8ff
- [x] 4.3 get.test.ts passes — b12e8ff
- [x] 4.4 Typecheck passes — b12e8ff
- [x] 4.5 Lint passes — b12e8ff

#### Manual

- [ ] 4.6 Doctor reports real API latency
- [ ] 4.7 List returns real course data
- [ ] 4.8 Get dry-run shows real artifacts

### Phase 5: CI Workflow

#### Automated

- [x] 5.1 check job still passes — e95e9a0
- [x] 5.2 check-windows passes with smoke tests — e95e9a0
- [x] 5.3 e2e job passes on ubuntu — e95e9a0
- [x] 5.4 e2e-windows job passes on windows — e95e9a0

#### Manual

- [x] 5.5 Jobs visible in workflow graph — e95e9a0
- [x] 5.6 Secrets not exposed in logs — e95e9a0
- [x] 5.7 E2e failure doesn't block check job — e95e9a0
