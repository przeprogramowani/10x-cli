<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cross-Platform E2E Tests

- **Plan**: context/changes/e2e/plan.md
- **Scope**: All phases (1–5)
- **Date**: 2026-05-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Missing "nonexistent command" test case

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/global-flags.test.ts
- **Detail**: Plan specified `10x nonexistent` → exit 2 but the CLI actually exits 0 for unknown commands (CAC framework behavior). The plan's assumption was wrong.
- **Fix**: N/A — plan was inaccurate about CLI behavior.
- **Decision**: DISMISSED (plan inaccuracy, not implementation gap)

### F2 — No process kill/timeout in spawnCli

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/cli.ts:94-128
- **Detail**: `spawnCli` had no timeout mechanism. If the CLI hangs, the spawned process could become orphaned.
- **Fix**: Added a 60s kill timer that's cleared when the process exits.
- **Decision**: FIXED

### F3 — Unchecked fetch response on callback URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/auth-flow.test.ts:46, tests/e2e/support/auth-setup.ts:44
- **Detail**: `fetch(callbackUrl)` result was never checked. A 4xx/5xx would produce confusing downstream errors.
- **Fix**: Added response status check with clear error message at both call sites.
- **Decision**: FIXED

### F4 — Hardcoded email string in doctor test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/doctor.test.ts:54
- **Detail**: Asserted against literal "smoke-test@przeprogramowani.pl" instead of env var.
- **Fix**: Now imports `getE2EEnv()` and asserts against `env.testEmail`.
- **Decision**: FIXED

### F5 — E2e jobs don't gate the release pipeline

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: .github/workflows/ci.yml:136
- **Detail**: `version` job needs only `[check]`, not `[check, e2e]`. Intentional — e2e tests hit external services and can be flaky.
- **Decision**: ACCEPTED

### F6 — No earlyExit race in standalone auth-flow.test.ts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/auth-flow.test.ts:37-48
- **Detail**: Unlike auth-setup.ts, the standalone test didn't race findCallbackUrl against early CLI exit.
- **Fix**: Applied the same Promise.race pattern from auth-setup.ts.
- **Decision**: FIXED

### F7 — Temp directories never cleaned up

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/cli.ts:42-44
- **Detail**: Every `runCli` call creates a temp dir that was never removed.
- **Fix**: Added `cleanupTempDirs()` export and `afterAll` hooks in all test files.
- **Decision**: FIXED
