<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: 10xDevs 4 CLI selection and local-file safety

- **Plan**: ../plan.md
- **Scope**: CLI Phases 4 and 5, staged implementation; Phase 6 excluded
- **Date**: 2026-09-12
- **Verdict**: APPROVED (bounded local code review)
- **Findings**: 0 critical, 2 warnings — both fixed and independently rechecked
- **Method**: Two independent read-only reviewers, plan-drift and safety/quality roles; parent owns all gates. Not the final phases 1–6 review.

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS: local CLI gates and injected-failure regressions |

## Findings

### F1 — Source rules can disagree with ownership after a ledger failure

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: src/lib/tool-switch.ts:162–163,195–201,222–226
- **Detail**: Profile migration strips a clean source rules block before final source-manifest write/delete. If that operation fails, on-disk source.managedRules still claims the removed block. Explicit profile cleanup has the same ordering. The ordinary file-transfer path restores bytes after analogous failure; rules lack that recovery.
- **Fix**: Couple source-rule removal and ownership retirement; restore exact original source bytes if ledger persistence fails. Cover migration and cleanup, including surrounding text, truthful destination ownership and restored source manifest/bytes.
- **Decision**: FIXED and independently rechecked by both reviewers. Source-rule snapshot/ledger restoration covers migration and cleanup; injected manifest-delete failures preserve exact source bytes and valid destination ownership, and retry succeeds.

### F2 — Failed temporary migration write prevents retry

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/tool-switch.ts:134–138
- **Detail**: Fixed destination .tmp is created exclusively but is not cleaned after partial write/chmod/rename failure. The next attempt fails EEXIST even after the original error clears.
- **Fix**: Use an invocation-owned unique temporary file with guarded cleanup, preserving preexisting/unowned files. Test an injected first failure followed by successful retry with source/destination ownership checks.
- **Decision**: FIXED and independently rechecked. Unique temporary ownership is established by exclusive open before writing; cleanup runs only for invocation-owned paths. Partial-write/chmod/rename failures all allow successful retry, preserving an unrelated fixed .tmp.

## Verified matching behavior and limits

Reviewers found no further substantive issue in explicit→binding→backend selection, normalization, unavailable/revoked no-fallback behavior, single locked stale-grant refresh, corrupt/future/conflicting manifest rejection, first-write binding, read-only preflight, managed hash-checked removal, local/untracked/config/shared protection, path containment, local-state/representation freshness, rule baselines, shared owners or sentinel text preservation. Stable-path protection does not claim atomic defense against simultaneous hostile filesystem replacement.

Before these new findings, the complete CLI suite passed 606 tests, typecheck, lint (zero errors), ESM and native builds. Deliberate-break tests protected modified-file preservation, rule conflicts under --force and local freshness. These earlier gates do not prove the newly identified failure paths; new regressions and exact restored-code checks are required. No phase 4/5 commits claimed while the ordered Phase 3 source gate remains deferred with PR #30. Phase 7 untouched.

After fixes, 51 focused tests PASS and full CLI 611 tests/34 files PASS; typecheck, lint (zero errors), ESM and native builds PASS. Both new deliberate breaks went red and exact staged fixes were restored. Logs `/tmp/10x-v4-p5-review-fix-tests.log`, `/tmp/10x-v4-p5-review-full.log`, `/tmp/10x-v4-p5-review-source-rules-break.log`, `/tmp/10x-v4-p5-review-temporary-cleanup-break.log`. Progress 5.2/5.9 checked again after new evidence. This bounded approval does not certify Phase 6, Windows CI, deferred master-source gate or production rollout.
