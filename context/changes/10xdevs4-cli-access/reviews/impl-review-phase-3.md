<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: 10xDevs 4 access and delivery

- **Plan**: ../plan.md
- **Scope**: Phase 3 implementation in Toolkit and CLI; later phases excluded
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings — all code findings fixed and independently rechecked
- **Method**: Independent plan-drift and safety/quality reviews; parent owns execution gates. This is not the required final phases 1–6 review.

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PENDING: final clean v3 source build after prerequisite PR #30 |

## Findings

### F1 — Universal SKILL.md references bypass final closure validation

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: Toolkit packages/course-content/src/build/source-revisions.ts; src/build/validate-curriculum.ts
- **Detail**: The files array was checked, but universalContent delivered as SKILL.md for other tools was checked only for frontmatter and size. A new dangling references/nonexistent.md link could pass final validation.
- **Fix**: Check universalContent as another SKILL.md body against the unchanged delivered inventory; cover EN and PL dangling links and valid references.
- **Decision**: FIXED and independently rechecked. 58 source/curriculum tests passed; bypassing universal validation failed the regression, then exact staged bytes were restored. Final real-content validation remains separate.

### F2 — Backup destination can resolve into the repository

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Safety & Quality
- **Location**: Toolkit packages/api/scripts/content-inventory.mjs
- **Detail**: Lexical descendant checks miss output equal to the repository root and external paths whose ancestors are symlinks into it. A production-byte backup can therefore land under source control.
- **Fix**: Validate real destination and existing ancestors before opening R2, reject repository root/descendants and symlinks, and enforce the documented new external directory. Add both reproductions.
- **Decision**: FIXED and independently rechecked. Destination/recovery focused suite passed (42 tests); bypassing destination validation failed the regression, then exact staged bytes were restored.

### F3 — Recovery depends on an expiring CI artifact

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Safety & Quality
- **Location**: Toolkit .github/workflows/promote-content.yml; packages/api/scripts/r2-sync.mjs
- **Detail**: Rollback and withdrawal always download the original build artifact, retained only 90 days. Retained R2 releases cannot recover through the sole authorized workflow after artifact expiry; even withdrawal is unnecessarily blocked.
- **Fix**: Keep canonical authorization, manual exact expected-current identity and CAS. Withdrawal needs no build artifact; rollback verifies the exact selected retained R2 release and its hashes. New promotion continues to require the exact verified green-build stage.
- **Decision**: FIXED and independently rechecked. Retained-release recovery and incorrect-hash cases passed; restoring the old artifact requirement failed the regression, then exact staged bytes were restored. No production recovery operation was performed.

## Gate limits

The user deferred PR #30 and its permanent post-merge master pin. Independent candidate verification proceeds; no permanent PR SHA pin was introduced. Final v3 master build/full ci:local remain pending.

Actual transform v4 failed independent final validation for an expanded imperative prompt. The v5 source-boundary fix passed tests and a real prompt probe, then failed closed in the full run on a model-rendered YAML frontmatter code fence. Actual responses are retained for a bounded second fix; no invalid output was staged or uploaded. Those failures were retained as evidence; no invalid content entered staging.

V6 translation keeps the source YAML frontmatter byte-identical outside generation and translates only its body, with both body and full-document integrity checks. The actual previously failing stack-assess universal translation now passed (18160 chars, exact source header retained). Generation/transform focused tests: 16 passed; all three review-fix deliberate-break checks failed as intended and were restored. Full real v6 transform and final curriculum validation now PASS (49 artifacts, 5 lessons, EN/PL, 10 bundles, zero unresolved entries). Exact staged real outputs passed 11 actual isolated R2 publisher assertions, including racing conditional creates/updates, interrupted upload, immutable retention, rollback and withdrawal/restore. Progress 3.7/3.9 are checked. The R2 trial exposed a Node Buffer bridge incompatibility; exact-length Uint8Array normalization fixed it, actual local bridge regression and deliberate-break check passed, and the full API suite passed 563 tests. See evidence.md and /tmp/10x-v4-p3-publisher-trial/result.json. Code findings are closed; overall NEEDS ATTENTION reflects the deliberately deferred master-source/full-clean gate only. This is not the final phases 1–6 review.
