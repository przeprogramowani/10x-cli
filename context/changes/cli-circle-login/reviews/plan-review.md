<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Circle Message Login for 10x CLI

- **Plan**: context/changes/cli-circle-login/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE (initial) → SOUND after triage 2026-09-13; see *Triage outcome* below
- **Findings**: 1 critical, 5 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding
Grounding: 23/24 paths ✓ (only the proposed new `packages/api/docs/runbooks/` folder is absent, see F4), 9/9 symbols ✓ (`createAuthSession`, `sha256`, `constantTimeEqual`, `activeRegisteredCourseIds`, `authRoute` mount at `src/index.ts:70`, `pollVerifySession`, `ERROR_CODE_MESSAGES`, `AUTH_FILE_VERSION`, `generate-types --check`), brief↔plan ✓ (7 phases, 11 decisions, scope match). Progress: 25 criteria ↔ 25 rows, one `## Progress`, no checkboxes outside it. Pins `39925ab6` / `965539af` / `b0c789af` verified on `origin/master` earlier this session.

## Findings

### F1 — DO tests cannot run where the plan points them

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — item 5 and criteria 2.1/2.2
- **Detail**: The Toolkit unit lane is plain node vitest (`packages/api/vitest.config.ts`, no `@cloudflare/vitest-pool-workers`); only the E2E lane (`vitest.e2e.config.ts`) spawns workerd via `unstable_dev` (`harness.ts:163-173`). The harness writes a synthetic `wrangler.json` with only KV/R2/vars (`harness.ts:134-162`) and `fixture-worker.ts` defines its own `export default { fetch }` without re-exporting classes. `bun run test -- circle-login/device-login` would therefore run in node, where Durable Objects do not exist. W04 explicitly says "a mock is not proof".
- **Fix A ⭐ Recommended**: Run DO proofs in the E2E lane: extend the harness `wrangler.json` with `durable_objects.bindings` + `migrations`, re-export the DO classes from `fixture-worker.ts`, expose `/__fixture/circle/*` hooks for concurrent approve/redeem and alarm triggering, and change criteria 2.1/2.2 commands to `bun run test:e2e -- circle-login` (or the repo's E2E script name).
  - Strength: Uses the only workerd infrastructure that exists today; no new test runner.
  - Tradeoff: Concurrency tests drive the DO through HTTP hooks, not direct class calls; alarm tests need a fixture hook to fire `alarm()`.
  - Confidence: HIGH — harness and fixture seams read in-session.
  - Blind spot: `unstable_dev` DO support for `new_sqlite_classes` under wrangler 4.80 not exercised in this repo yet.
- **Fix B**: Add `@cloudflare/vitest-pool-workers` with a `defineWorkersConfig` unit lane for `src/__tests__/circle-login/**`.
  - Strength: Direct class-level tests with `runInDurableObject`, simplest concurrency assertions.
  - Tradeoff: New dependency and second vitest config in a repo that has none; CI job changes.
  - Confidence: MEDIUM — standard Cloudflare tooling, but unverified against this repo's `nodejs_compat` setup.
  - Blind spot: Interaction with the existing node unit lane (module mocks) unknown.
- **Decision**: FIXED via Fix A — DO proofs moved to the E2E lane (`src/__tests__/e2e/circle-login-do.test.ts`), harness `wrangler.json` gains DO bindings + migrations, fixture-worker re-exports DO classes and exposes `/__fixture/circle/*` hooks; criteria 2.1–2.4 commands rewritten to `pnpm` scripts.

### F2 — Token minting needs an extraction the plan does not name

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 4 — item 1 ("createAuthSession-adjacent helpers")
- **Detail**: JWT signing and refresh-family creation are inlined in `verifyCallback` (`src/services/auth.ts:220-255`) and duplicated with different semantics in `refreshTokens` (`:312-437`); no exported `(email, courses) → {token, refresh_token, expires_at}` helper exists. Refresh-token records (`rt:<hash>`, `rtfam:<id>`) live in `CLI_10X3_AUTH_KV`, so the Circle flow must write them there too; the DO cannot own refresh state.
- **Fix**: Add a Phase 4 change item: extract `issueTokenPair(email, courses, env)` from `verifyCallback:220-255`, reuse it in `refreshTokens`, and call it from `poll` redemption; record that the extraction changes `src/services/auth.ts` but not the email routes, with the compatibility suite as the gate. Update the DO contract: `jwt`/`refresh_token` cached between `approved` and `redeemed` only if minted at approval; otherwise mint inside `redeem` and drop those columns.
- **Decision**: FIXED — Phase 4 item 2 adds `issueTokenPair` extraction from `verifyCallback:220-255` (used by `verifyCallback` and Circle `poll`); `refreshTokens` duplicate left untouched; DO no longer stores token material; poll mints after atomic `redeem`.

### F3 — Origin check assumes a host the repo does not configure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — item 1 approve ordering; Open Risks (W10)
- **Detail**: `wrangler.toml` has no `routes`/custom domain; `toolkit.przeprogramowani.pl` is attached in the dashboard and the preview/`workers.dev` host also serves the Worker. CORS is `hono/cors` with `ALLOWED_ORIGINS` defaulting to `*` (`src/index.ts:38-43`), and no route checks `Origin` today. A hard-coded hostname would break approval on preview URLs, and the CORS default means the `Origin` check is the only cross-site guard for `approve`.
- **Fix**: Compare `Origin` to the Worker's own origin (`new URL(c.req.url).origin`) rather than a fixed hostname; state that `ALLOWED_ORIGINS` must never be widened to cover `/auth/circle/approve`; rewrite W10 as "the DM link host and the page host are the same origin".
- **Decision**: FIXED — `approve` compares `Origin` with `new URL(c.req.url).origin`; `ALLOWED_ORIGINS` explicitly not applied; W10 reworded in brief.

### F4 — Runbook path breaks the Toolkit docs convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — item 3; Phase 7 — item 3
- **Detail**: Toolkit keeps operational runbooks in `docs/how-to/` (Diataxis layout; e.g. `deploy-api.md`, `configure-10xdevs4-circle.md`, `drain-and-resync-membership-kv.md`) and reference in `docs/reference/` (`environment-variables.md`, `api-endpoints.md`). `packages/api/docs/` does not exist.
- **Fix**: Target `docs/how-to/login-with-circle.md` for the runbook and add rows to `docs/reference/environment-variables.md` and `docs/reference/api-endpoints.md`; keep `packages/api/README.md` Bindings section in sync.
- **Decision**: FIXED — runbook at `docs/how-to/login-with-circle.md`; reference rows in `docs/reference/environment-variables.md` and `api-endpoints.md`; README Bindings section.

### F5 — Generated-types check commands are not runnable as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 criterion 5.4; Phase 7 criterion 7.1
- **Detail**: `scripts/generate-types.ts:21-23` makes `--check` throw unless `OPENAPI_SPEC_PATH` points at a candidate spec ("deployed/latest is not a candidate contract"). The check runs in the Toolkit coordinated CI job (`.github/workflows/ci.yml:228-241`) against the E2E-emitted spec, not in the CLI's own CI. Criterion 7.1 (check against production) contradicts the script's rule.
- **Fix**: 5.4 → `OPENAPI_SPEC_PATH=<candidate-openapi.json> bun run generate-types --check`; 7.1 → "Toolkit coordinated CI job green against the deployed candidate; `bun run generate-types && git diff --exit-code src/generated` after the deploy".
- **Decision**: FIXED — 5.4 sets `OPENAPI_SPEC_PATH`; 7.1 now "coordinated CI job green" plus regenerate-and-diff; Progress row 7.1 retitled before implementation.

### F6 — Phase 1 manual gate is not enforced by autonomous implementation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 Implementation Note; Phase 3 — item 1
- **Detail**: `/10x-goal-implement` only flips `#### Automated` rows and never waits on manual ones, so an autonomous run would build Phase 3 transport with an unverified header form. Phase 3 hard-codes "the header form recorded in Phase 1".
- **Fix A ⭐ Recommended**: Make the header scheme configuration: `CIRCLE_MESSAGING_AUTH_SCHEME = "Token" | "Bearer"` (default `Token`, EDU's proven form) in `wrangler.toml` vars; Phase 3 then does not depend on Phase 1, and Phase 1 becomes a prerequisite of Phase 7 (pilot) only.
  - Strength: Removes the only code dependency on the manual gate; a wrong guess is fixed by a var, not a deploy of new code.
  - Tradeoff: One more variable to document and test.
  - Confidence: HIGH — both forms differ only in the header prefix.
  - Blind spot: If W01 shows neither token can message, the channel stops regardless of scheme.
- **Fix B**: Keep the gate and add an Implementation Note to Phase 3 stating it must not start until 1.1 is checked.
  - Strength: No new configuration.
  - Tradeoff: Relies on a human reading the note; autonomous runs can violate it silently.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — `CIRCLE_MESSAGING_AUTH_SCHEME = Token|Bearer` var (default `Token`); Phase 1 gates Phase 7 pilot only; rows 1.1/1.2 remain unchecked and must be checked by the operator before pilot; no live message was sent.

### F7 — Second AuthData constructor and TTY predicate

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — items 1 and 3
- **Detail**: `AuthData` literals exist at `src/commands/auth.ts:163-170` (login save) as well as `auth-guard.ts:181-188`; the plan lists only the latter. `resolveContext` derives `json` from `stdout.isTTY` only (`output.ts:69-71`), so the chooser condition should be `!ctx.json` and must tolerate a non-TTY stdin.
- **Fix**: List `src/commands/auth.ts:163-170` in Phase 5 item 3 and phrase the chooser condition as "when `ctx.json` is false and `--method` is absent".
- **Decision**: FIXED — `src/commands/auth.ts:163-170` listed in Phase 5 item 3; chooser condition phrased as `ctx.json` false and `--method` absent.

## Triage outcome (2026-09-13, operator-delegated)

Operator instruction: apply triage autonomously, focus on a working minimal launch scope, runnable tests and commands, correct auth flow; defer the rest explicitly; no new test runners or optional refactors. No live DM was sent; Phase 1 rows stay unchecked.

| Finding | Outcome | Note |
|---|---|---|
| F1 | Fixed (Fix A) | Existing E2E lane hosts DO proofs; no `@cloudflare/vitest-pool-workers` (Fix B deferred: new runner not needed). |
| F2 | Fixed | Narrow extraction of `issueTokenPair`; `refreshTokens` duplicate deferred (no email-auth refactor). |
| F3 | Fixed | Self-origin comparison; no hard-coded host. |
| F4 | Fixed | Docs follow `docs/how-to` + `docs/reference` convention. |
| F5 | Fixed | Commands now match `scripts/generate-types.ts` and Toolkit CI. |
| F6 | Fixed (Fix A) | Header scheme is configuration; live DM still required before pilot. |
| F7 | Fixed | Second `AuthData` literal and TTY predicate recorded. |

Deferred explicitly (not findings, noted for later): typed `user_code`/explicit click hardening (D02 decision stands); `refreshTokens` de-duplication; per-community secrets (D07 interview scope); unit-lane DO runner.

Documentation discrepancy: `decisions.md` D03 shows B from the older export; the operator's interview correction to A governs and is recorded in `plan.md` and `change.md`. Owner fields are changed only by a new export + `apply-record`.

### Absolute start conditions (before `/10x-goal-implement`)

1. Explicit operator approval of plan version below.
2. Toolkit Cloudflare account confirmed to support SQLite-backed Durable Objects (dashboard check, recorded in the Phase 2 PR).
3. `CIRCLE_MESSAGING_TOKEN` provisioning path agreed (dedicated token or existing one) — value needed only at Phase 7.
4. Release slot for the CLI agreed with the v4-release coordinator; its CI candidate variables and run pointers untouched.
5. Before Phase 7 pilot only: operator executes the Phase 1 live DM and checks rows 1.1/1.2 themselves.

Verdicts after triage: End-State PASS · Lean PASS · Architectural Fitness PASS · Blind Spots PASS · Plan Completeness PASS → **SOUND**.
