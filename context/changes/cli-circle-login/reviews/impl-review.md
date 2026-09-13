<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Circle message login for 10x CLI

- **Plan**: context/changes/cli-circle-login/plan.md
- **Scope**: Phases 2–6 of 7 (all phases with checked Automated rows; Phase 1 and Phase 7 are operator-gated and not reviewed)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 8 observations
- **Triage**: completed 2026-09-13 by delegated autonomous triage (operator directive "sam rozstrzygaj triage"); decisions below were made by the agent under that delegation, not clicked by the operator. Fixed: F1, F2, F6, F7, F9a/b. Accepted: F8, F10. Deferred with required pilot evidence: F3, F4, F5, F9c.

Reviewed ranges: Toolkit `feat/cli-circle-login` `39925ab..3a55f15` (4 commits) and CLI `plan/cli-circle-login` `b0c789a..6c39e5e` (code commits `a677271`, `0363452`, `46a7e3a`), `context/` excluded. Two review subagents (plan drift; safety, quality and pattern compliance) ran in parallel; success criteria were reconciled against the recorded gate logs and re-run where the poll route changed. F1 and F2 were fixed after the review in Toolkit commit `8a6817d41db6b5ac0a6d48d399375a70865a08a5` (gated: 689 unit, 18 DO, 4 route, 5 Circle CLI and 29 released-CLI E2E tests green; `/openapi.json` byte-identical to the Phase 4 candidate). Both were kept and re-verified during the delegated triage (see the Triage line above).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (F2, fixed in `8a6817d`) |
| Scope Discipline | WARNING (F10, benign extras) |
| Safety & Quality | WARNING (F1, fixed in `8a6817d`) |
| Architecture | PASS |
| Pattern Consistency | WARNING (F9, minor) |
| Success Criteria | PASS |

Architecture: D03-A (two SQLite Durable Objects, one `transactionSync` per transition), D02 auto-approve on open, a single `CIRCLE_MESSAGING_TOKEN`, no email/refresh refactor (`/auth/login|callback|verify|refresh` handlers unchanged, `refreshTokens` zero diff lines), same-origin approve check independent of `ALLOWED_ORIGINS`, entitlement read-only at start, approve and poll, tokens minted only on the first poll after an exactly-once `redeem`. All confirmed by both reviewers.

## Success criteria verification

| Row | Criterion (short) | Evidence | Result |
|-----|-------------------|----------|--------|
| 2.1, 2.2 | DO state machine and alarm under workerd | `e2e/circle-login-do.test.ts`, 18 tests (`gate-2.1.log`, re-run `gate-review-circle-login-do.log`) | PASS |
| 2.3 | Budget windows and subjects | `circle-login/policy.ts` thresholds equal the plan table; budget unit tests (`gate-2.3-unit.log`, `gate-2.3-e2e.log`) | PASS |
| 2.4 | Wrangler dry-run lists both DOs | `pnpm --filter @przeprogramowani/api build` (`gate-2.4.log`, re-run today) | PASS |
| 3.1–3.3 | Transport classification, flags, PII guard, docs | `transport.test.ts`, `flags.test.ts`, `log-pii-guard.test.ts` (`gate-3-*.log`); docs gap F2 | PASS (F2 fixed) |
| 4.1–4.4 | Routes, entitlement matrix, ordering, origin, `checkSession` never called, released-CLI compat unchanged | `routes.test.ts` 36 tests, `log-shape.test.ts` 17, `e2e-cli.test.ts` 29 with `e2e-cli.test.ts` diff empty (`gate-4-*.log`, re-run today) | PASS |
| 5.1–5.4 | CLI start/poll kinds, exit codes, chooser, `method` round-trip, regenerated types | `bun test` 725 (`gate-5-test2.log`), `generate-types --check` (`gate-5-gencheck.log`), typecheck, lint, build, binary | PASS |
| 6.2 | Coordinated E2E without live messages | `e2e-cli-circle.test.ts` 5 scenarios (`gate-6.2.log`, re-run today) | PASS |
| 6.1 | Same matrix on Linux/Windows private CI | Needs a branch push; not run | UNVERIFIED (row honestly unchecked) |
| 7.1 | Deployed candidate | Not deployed | UNVERIFIED (row honestly unchecked) |

Manual rows 1.1, 1.2, 4.5, 5.5, 7.2–7.4 are unchecked and belong to the operator; none is rubber-stamped. Plan item 5.5 names `tests/helpers/clack-mock.ts`; the file is untouched because the existing `select` mock already covers the chooser (tests pass), noted here rather than as a finding.

## Findings

### F1 — Unauthenticated `poll` instantiated a Durable Object for unknown codes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/routes/auth-circle.ts:347 (as reviewed), services/circle-login/device-login.ts:99-121
- **Detail**: `poll` was the only route that reached a Durable Object before any existence or budget check. A POST with any well-formed 43-character `device_code` called `inspectForPoll`, whose constructor runs `CREATE TABLE IF NOT EXISTS`, leaving a persisted SQLite object with no row, no alarm and no purge path: an attacker-controlled storage and object-count amplifier at zero cost. `approve` was already gated by the KV bearer index.
- **Fix**: Read the existing `circle:login:<hash>` KV record (TTL equals the login TTL) before touching the DO and return the same `410 expired` when absent; reuse the record for the email at redeem time. Applied in Toolkit `8a6817d`; route test asserts no object is created for an unknown code and went red with the gate removed.
  - Strength: One KV read per poll, no new state, no behaviour change for valid logins; the email flow already relies on the same KV propagation between callback and verify.
  - Tradeoff: A poll that reaches a different colo than `start` within the KV propagation window (up to 60 s) would see 410; start and poll come from the same CLI process, so this is no worse than the existing email path.
  - Confidence: HIGH — identical KV gating already protects `approve`.
  - Blind spot: DDL still lives in the DO constructor; a login that legitimately exists keeps its schema pages after `alarm()` (see F5).
- **Decision**: FIXED — Toolkit `8a6817d`, kept and re-verified on 2026-09-13 (KV gate present, route test red without it, all lanes green)

### F2 — Runbook missed three `*.request` events and the `login_exists` detail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/how-to/login-with-circle.md:143-145
- **Detail**: Plan item 3.3 requires the how-to to list every log event name and reason value. `auth.circle.{start,poll,approve}.request` and the `rate_limited` detail `login_exists` (device-code collision at `auth-circle.ts:275-279`) were absent.
- **Fix**: Add the request line and the detail value to the route-events section. Applied in Toolkit `8a6817d`.
- **Decision**: FIXED — Toolkit `8a6817d` (events and `login_exists` listed in the how-to)

### F3 — Budget reservations are not rolled back on a later denial

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/routes/auth-circle.ts:242-261
- **Detail**: `start` reserves admission, then account, then community. A community-level 429 also burns the caller's 60 s account cooldown and one hourly and daily slot. Low impact at current thresholds.
- **Fix**: Reserve community before account, or add a `release` method to `AuthBudget`. Leave for the pilot unless the community budget is observed to trip.
- **Decision**: DEFERRED — follow-up `follow-ups/review-fixes.md` (needs pilot evidence: `auth.circle.budget.denied` with `kind: community` while account buckets are burnt)

### F4 — Upstream Circle `429` is classified as a hard rejection

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/services/circle-login/transport.ts:375-376, routes/auth-circle.ts:292-301
- **Detail**: A Circle-side 429 maps to `rejected`, so the login is denied and the CLI reports `dm_rejected` ("use email"). Safe (nothing delivered) but conflates transient throttling with a permanent rejection.
- **Fix**: Map upstream 429 to a distinct `rate_limited` response with `retry_after_s`, or to `unknown` with retry guidance. Plan classified 4xx as rejected deliberately; changing it is a small contract change for a follow-up.
  - Strength: Keeps users on the Circle channel during short throttling.
  - Tradeoff: A second classification path and CLI copy; needs a transport test and docs update.
  - Confidence: MEDIUM — Circle's throttling behaviour is unmeasured until the pilot.
  - Blind spot: No evidence yet that the messaging endpoint throttles at pilot volume.
- **Decision**: DEFERRED — contract kept as planned (4xx incl. 429 → rejected); follow-up needs pilot evidence: `auth.circle.transport` lines with `status: 429`

### F5 — `alarm()` keeps the SQLite tables, and `triggerAlarm` lives on the production class

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/services/circle-login/device-login.ts:305-313, auth-budget.ts:190-218
- **Detail**: `alarm()` deletes rows but not tables, so every completed login leaves a small persisted object. `triggerAlarm()` is a test-only RPC on the production DO; it is only reachable through the fixture entry module (`ENVIRONMENT === "e2e"` plus control token) and `wrangler.toml` pins `production`.
- **Fix**: Call `ctx.storage.deleteAll()` in `alarm()` and re-run the DDL lazily on next use; optionally move `triggerAlarm` behind the fixture module. Follow-up; storage per object is a few pages.
- **Decision**: DEFERRED — storage rework out of the pre-launch scope; follow-up needs pilot evidence: DO object count and storage after the first week

### F6 — Approval page lacks CSP and frame-ancestors headers

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/routes/auth-circle.ts:491-496, circle-approve-page.ts
- **Detail**: The page itself is clean (`textContent` only, bearer regex-constrained, fragment cleared via `replaceState`, `no-store`, `no-referrer`, `nosniff`). Defence in depth is missing: no `Content-Security-Policy` and no `X-Frame-Options: DENY`.
- **Fix**: Add `Content-Security-Policy: default-src 'none'; script-src 'sha256-<inline hash>'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'` and `X-Frame-Options: DENY`; pin them in `routes.test.ts`.
- **Decision**: FIXED — Toolkit `38f77e8` (CSP with script hash, `X-Frame-Options: DENY`; route test recomputes the hash from the served HTML)

### F7 — Transport never cancels the unread response body

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/services/circle-login/transport.ts:369-377
- **Detail**: The body is intentionally never read (no Circle text in logs), but it is not cancelled either; under workerd an unconsumed body can hold the connection until GC.
- **Fix**: `await response.body?.cancel()` before returning the classification.
- **Decision**: FIXED — Toolkit `38f77e8` (`response.body.cancel()` after the status read; transport test asserts `bodyUsed`)

### F8 — Admission bucket is keyed by `JWT_SECRET`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/api/src/routes/auth-circle.ts:183-185, services/circle-login/crypto.ts
- **Detail**: The per-IP subject is `HMAC(JWT_SECRET, "circle-auth:v1:admission:" + ip)`. Domain separation is correct; rotating `JWT_SECRET` also resets every admission bucket.
- **Fix**: Document the coupling in `docs/reference/environment-variables.md`; introduce a dedicated key only if independent rotation is ever needed.
- **Decision**: ACCEPTED — coupling documented in `docs/reference/environment-variables.md` (Toolkit `38f77e8`); no new secret before launch

### F9 — CLI polish: 429 hint drops `retry_after_s`, split import, email poll SIGINT symmetry

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/commands/auth.ts:3-10, :286-306, :396-404
- **Detail**: (a) The 429 branch hard-codes "Too many Circle login requests for this email" although the budget may be per-IP or community, and drops the server's `retry_after_s` (`ApiResult.payload` is available). (b) `saveAuth` is imported in a second statement from `../lib/config` instead of the grouped import used by sibling commands. (c) `@clack/prompts` registers its own SIGINT listener, so Ctrl-C during the email poll now also unwinds through `pollVerifySession`, which lacks the abortable sleep the Circle poll has; behaviour is correct, only the wait is longer.
- **Fix**: Surface `retry_after_s` in the hint with budget-neutral wording; merge the import; pass the same signal into `pollVerifySession`. All three are small and can ride the next CLI release.
- **Decision**: FIXED (a, b) — CLI `b6415c5` (retry-aware, budget-neutral 429 hint; merged import); (c) DEFERRED — email path stays byte-for-byte as 1.20.0, see follow-ups

### F10 — Benign additions beyond the plan text

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: device-login.ts:117-119 (`poll_clock`), auth-circle.ts:275-279 (`login_exists`), :494 (`nosniff`), transport.ts:123 (`token_missing` guard), e2e-cli-circle.test.ts:174 (extra revoked scenario), CLI auth-flow.ts:173-190 (`describeCircleClient`), CLI auth.ts:204,212 (email login records `method: "email"`)
- **Detail**: Each was narrated during implementation, stays inside the plan's contracts (`client?` shape, "plus `method`" in the envelope) and adds no public surface beyond one `429` detail value. None conflicts with "What we're NOT doing".
- **Fix**: Record them as a plan addendum under Phase 2/4/5 notes so future reviews treat them as ground truth.
- **Decision**: ACCEPTED — recorded as "Implementation addenda" in `plan.md`

## Post-triage verification — 2026-09-13

Toolkit `38f77e8327ed307c3b9dde29d19cc0a2ddfac455` and CLI `b6415c574266d63b1149c2641418a0ddbc0929ac`, all local (macOS): Toolkit unit 693, wrangler dry-run with both DOs, workerd lanes DO 18 / routes 4 / Circle CLI 5 / released-CLI compatibility 29 against the rebuilt candidate binary, `/openapi.json` byte-identical to the Phase 4 candidate; CLI typecheck, lint (3 pre-existing warnings in untouched files), 727 tests, build, binary. Break-checks: CSP hash test, body-cancel tests (3) and the 429-hint test each went red on broken code and the files were restored before commit. Hosted Linux/Windows CI has not run; these local results are not that evidence.
