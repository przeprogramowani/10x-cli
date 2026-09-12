<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: 10xDevs 4 access and delivery

- **Plan**: [canonical plan](../plan.md)
- **Scope**: Completed phases 1–2 of 7; Toolkit implementation and CLI canonical context. Phases 3–6 are not certified by this review.
- **Date**: 2026-09-12
- **Verdict**: APPROVED for reviewed phases after corrections; the complete change is not release-ready.
- **Findings**: 0 unresolved critical, 0 unresolved warnings, 1 inherited-baseline observation. Initial review found 1 critical, 1 warning and 1 additional observation, all corrected below.
- **Authority**: Accepted decisions D01–D16 unchanged. Scope and safety reviews ran independently via two review agents; main executed gates and deliberate-break checks.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS for phase 1 and 2 Automated criteria |

## Findings

### F1 — Pending email migration could prevent revocation after roster removal

- **Severity**: CRITICAL
- **Impact**: MEDIUM — narrow lifecycle correction with identity-safety implications.
- **Dimension**: Safety & Quality
- **Location**: Toolkit `packages/api/src/services/circle-sync.ts`, `reconcileCourseMembers`; `services/email-drift.ts`, `recoverMigrationForRemoval`.
- **Detail**: At initial phase-1 commit `7f0ce09`, failure after new primary/reverse writes but before old-email deactivation left a marker. Recovery visited current roster IDs only; removals skipped the marker indefinitely if the person left Circle before retry.
- **Fix**: Recover removal candidates before revocation from fresh, hash-addressed records. Complete a verified destination transition; cancel only demonstrably unapplied intent with identical active old/reverse records and no destination. Retain conflicting markers and protect affected identities before any revokes.
- **Decision**: FIXED. Ten failure/restart/removal cases, five conflict/corruption cases, and deliberate omission of recovery (13 failures) verify the fix. Unrelated/manual grants survive.

### F2 — Backfill exceeded the observed cohort's request budget

- **Severity**: WARNING
- **Impact**: LOW — bounded-read and unchanged-write optimization within the existing KV model.
- **Dimension**: Safety & Quality
- **Location**: Toolkit `packages/api/src/services/circle-sync.ts`, `backfillMemberIdIndex`.
- **Detail**: Initial implementation used over 16,280 KV operations for 4,070 healthy records in one invocation. Cron's separate 265-operation regression did not cover this path.
- **Fix**: Batch primary/index/marker snapshots, skip byte-identical healthy indexes, and re-read identity before actual mutations.
- **Decision**: FIXED. A paginated 4,070-record fixture verifies 128 KV operations and zero writes. Replacing bulk reads with single-key reads makes the test fail. No remote backfill was executed.

### F3 — Backfill needed exact primary-key/email correspondence

- **Severity**: OBSERVATION
- **Impact**: LOW — one identity guard and regression.
- **Dimension**: Safety & Quality
- **Location**: Toolkit `packages/api/src/services/circle-sync.ts`, backfill mutation guard.
- **Detail**: Matching fresh and snapshot email values alone did not prove the primary key actually encoded that email's hash.
- **Fix**: Require the candidate key to equal the normalized email's membership key before mutation.
- **Decision**: FIXED. Mismatched-key regression rejects the write; existing placeholder-key fixtures now use real hashes without relaxing assertions.

### F4 — Standalone API typecheck has inherited baseline errors

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — a separate baseline cleanup is required before claiming a clean API typecheck.
- **Dimension**: Success Criteria
- **Location**: Toolkit API tsconfig and existing tests/routes.
- **Detail**: Additional `pnpm --filter @przeprogramowani/api exec tsc --noEmit` fails with 61 diagnostics. An independently extracted `da989a6` baseline with the same dependencies fails with 62. New fixture diagnostics were corrected; the final candidate adds no file/error-code diagnostic, and removes the retired event route's diagnostic. Existing Response/handler types, Worker scheduled types, webhook Pick fields and fake typing account for the remaining baseline. The repository's prescribed `ci:local` does not run this standalone API command.
- **Fix**: Address the inherited API typecheck baseline separately; do not call this command green or weaken its configuration.
- **Decision**: RECORDED as an inherited limitation; no full API typecheck success claimed.

## Verification evidence

- Phase 1 initial commit: API 350 tests and full Toolkit `pnpm ci:local` passed. CLI context bootstrap: 490 unit tests, typecheck, lint, build and binary passed.
- Final phase-1 corrections plus phase 2: course-content runtime build passed; API 490 tests in 29 files passed, including 36 membership/identity tests and 96 course-route matrix tests.
- Deliberate breaks: access bypass produced 26 failing tests; a new unclassified endpoint failed the inventory; omitted removal recovery produced 13 failures; non-bulk backfill failed the scale regression. All source edits were unconditionally restored from the staged candidate.
- Source reviews checked registry/light runtime boundaries, all six route guards and aliases, callback/normal/smoke refresh, legacy versus malformed claims, one-read live discovery, explicit KV/R2/schema errors, admin state-key normalization and retired event access with normal v3 m0l2 preserved.
- No new infrastructure, event enrollment, project migration, publishing, real emails or production writes. KV guarantees remain sequential/retry preservation, not cross-isolate serialization.
- Final repo-wide gate results and commit revisions are recorded in [evidence](../evidence.md) and canonical Progress.

## Scope adaptations

Existing admin module-state writes use the same registry slug as readers. Token generators in local JS/Python/E2E tools were updated; the smoke-token seed writes refresh records only, so its JWT change belongs in the refresh service. Present invalid/empty membership maps no longer fabricate legacy v3 access; only absence triggers legacy inference. Discovery represents withdrawal through absent catalog until the separate release envelope is implemented. The shared-skill-reference lesson is unaffected.

## Remaining work

Phase 3 requires W04's approved independent v4 curriculum and effective schedule/KV evidence, W05's approved full v3 cutoff with maintenance exceptions, and W08's isolated remote environment and real conditional-publisher trials. Current previews share live bindings and are unsuitable for write trials. Resolve these inputs through the targeted research and, where the plan needs changing, `10x-plan` followed by `10x-plan-review`; do not infer program or cutoff from v3 or substitute mocks for W08.

Phases 3–6 and their full implementation review remain pending. Phase 7 is not authorized for execution. This report does not mark the whole change implemented or archived.

Pending Manual rows (unchanged in canonical Progress):

- 7.4 Confirm intended v4 first-week materials, preview fixture rehearsal and secured-production real-account login/list/get/sync for v3-only, v4-only and dual-course users.
- 7.5 Review and execute the two-stage toolkit rollout followed by CLI publication; record successful account rehearsal and rollback-floor revision.
