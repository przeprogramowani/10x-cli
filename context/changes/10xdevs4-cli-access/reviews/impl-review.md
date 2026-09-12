<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: 10xDevs 4 access and delivery

- **Plan**: [Canonical plan](../plan.md)
- **Scope**: Full implemented phases 1–6 across CLI and Toolkit; phase 7 excluded.
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION — no unresolved code findings; source/full-clean and actual Windows CI evidence remain open.
- **Findings**: 0 critical, 2 warnings, 0 observations.
- **Reviewed range**: complete scoped worktrees (committed, staged and scoped untracked changes) relative to CLI `f89f19506cab8c9bbeb112242e4485fce4f1b77b` and Toolkit `da989a6f7d4963c275a98943e85d225baf426228`.

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING — incomplete source/full-clean and remote Windows evidence |

## Findings

### F1 — Final v3 maintenance source and clean gate remain deferred

- **Severity**: WARNING
- **Impact**: LOW — the source policy and ancestry regression are implemented; final source identity requires the deferred prerequisite.
- **Dimension**: Success Criteria
- **Location**: Toolkit `packages/course-content/src/courses/10xdevs3/sources.ts:5`; canonical Progress 6.2.
- **Detail**: Approved v3 cutoff remains `da989a6f7d4963c275a98943e85d225baf426228`. The historical tree lacks complete supporting documents. The full clean run stopped at `10x-implement/SKILL.md -> references/progress-format.md`; this file is also absent from the current PR #30 candidate. PR #30 contains the stack-assess repair, so its merge alone is insufficient; its current head is a candidate, not a permanent master pin. The user explicitly deferred checking/merging that PR. Candidate v4 validation, real R2 and compatibility tests do not substitute for the final clean source gate.
- **Fix**: Local exact document copies and parity protection are now prepared for the five additional affected packages, with both reviewers approving them. Once all required source repairs are handled separately on master, verify the actual resulting master commit, add only the required maintenance exceptions, and rerun the full clean gate. Preserve the approved course cutoff and fail-closed ancestry validation.
- **Decision**: DEFERRED BY USER — keep criterion open; do not request or perform an immediate merge.

### F2 — Actual exact-commit Windows CI evidence remains outstanding

- **Severity**: WARNING
- **Impact**: MEDIUM — remote candidate/fixture setup and execution are required to obtain evidence.
- **Dimension**: Success Criteria
- **Location**: Both `.github/workflows/ci.yml`; canonical Progress 6.3.
- **Detail**: Workflows pin both candidate SHAs, verify fixture identity and every v3 object, run Linux/Windows E2E, compare candidate OpenAPI, and retain exactly the tested release using both OS receipts. Local macOS verification does not prove Windows execution; candidate commits and remote CI have not been published/executed. The private v3 fixture producer and its archive are prepared locally, with no GitHub upload or dispatch.
- **Fix**: After source closure and ordered local commits, use separately authorized remote setup/run to record exact candidate SHAs, successful Linux/Windows jobs and verified fixture producer identity.
- **Decision**: PENDING EXTERNAL VERIFICATION — implementation is prepared, remote actions remain outside current authorization.

## Independent review evidence

Two independent read-only reviewers completed the full sweep, including the final Phase 6 receipt and fixture-producer changes. Both report no new substantive code findings and confirm prior fixes remain present. Their review did not run gates or mutate files.

Plan drift review found MATCH for all planned changes: membership identity/recovery, strict authorization and live discovery, event retirement, independent curriculum, source/package precedence and ancestry, immutable publisher/recovery, project selection/binding, read-only preflight, per-file ownership/removal, managed rules and sync freshness, real-auth compatibility matrix, deterministic schemas and exact candidate CI. Added fixture preparation and portable package-auth setup support the planned verification requirements. No edition-migration implementation or other unplanned product scope was found.

Safety/pattern review confirmed sequential grant preservation with explicit KV limits; centralized authorization and release verification; immutable byte checks and conditional publication; protected local ownership and truthful retry state; exact cross-repository candidates and tested-output reuse. Pattern comparisons used existing manifest/auth persistence, publisher authorization boundaries and skill source closure.

Earlier bounded reports remain supporting evidence: [Phase 3](impl-review-phase-3.md) and [Phase 4/5](impl-review-phase-5.md). Universal reference closure, backup destination guards, artifact-independent recovery, source-rules rollback and temporary-file cleanup findings are fixed and independently rechecked.

## Automated verification

- Real coordinated E2E: **29/29 PASS**, including 18 course/language/tool combinations, actual released npm CLI 1.20.0, existing v2/v3 projects, stale-grant purchase and access denial. Exact byte/hash comparisons and real intercepted-mail login/callback/poll/refresh; `/tmp/10x-v4-p6-real-e2e-fixed.log`.
- CLI: **611 unit tests PASS**, typecheck/lint/ESM/native builds PASS; **10 smoke tests PASS**. Final Phase 6 typecheck/lint/smoke rerun also passed.
- Phase 6 CI helper regressions: **10/10 PASS**; `/tmp/10x-v4-p6-final-input-tests.log`.
- Deliberate breaks: candidate SHA mismatch, rerendered release identity, substituted archive hash and real cross-course authorization each made the relevant tests fail. All production mutations restored exactly from staged bytes. Candidate OpenAPI drift check also failed as required without modifying generated types.
- Actual published-v3 archive prepared and verified locally: **57 complete objects PASS**; `/tmp/10x-v4-p6-actual-fixture-artifact.json`.
- Actual isolated remote R2 publisher: **11/11 PASS**, plus actual CLI read-only verify under Node 22.14.0. No production writes.
- Full Toolkit `pnpm ci:local`: **FAIL after all 807 tests passed**, at frozen-v3 support closure (`10x-implement/references/progress-format.md` missing); log `/tmp/10x-v4-p6-full-ci-local.log`. This report does not claim that gate passed.

## Final selected-source follow-up

The clean gate exposed a source gap beyond current PR #30. Read-only audit of 30 selected packages across 28 v3 lessons found five additional missing `progress-format.md` copies. Exact copies from the authoritative 10x-plan file were prepared locally in 10x-implement, 10x-impl-review, 10x-plan-review, 10x-tdd and 10x-goal-implement. All copies are 4,882 bytes and retain source SHA-256 `acd3841cb4b2baa3066f5ec4997d0c21b8791fcd432a66777fd8bcb38119e218`.

Both independent reviewers rechecked this bounded follow-up and approved it without findings. Parent verification: **25 shared-reference tests PASS**, actual parity validator PASS, all **30 local selected skill packages pass production support-closure validation**, formatting/lint PASS. Bypassing parity made its regressions fail and was restored exactly. Existing selector/assess full-tree parity and independent consumer documents remain supported. No SKILL.md, source configuration, Git ref or PR was changed. This closes the local code preparation gap, not F1's required historical master-source evidence.

## Remaining boundaries

Canonical Progress is the only execution tracker. Phase 6.1 is checked; 6.2/6.3 remain open. Ordered phase 3–6 commits are pending; preserved index snapshots retain separate phase boundaries. Phase 7 and both Manual rows remain untouched. No deployment, npm publication, production R2/KV writes, new push/merge, fixture upload or workflow dispatch was performed in this continuation. This review is not release approval or whole-goal completion.
