<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: 10xDevs 4 PR readiness

- **Plan**: [Canonical plan](../plan.md)
- **Scope**: Toolkit #31 and CLI #38, implemented phases 1–6; source/bootstrap prerequisite #30. Production phase 7 is separate.
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION — code findings fixed and locally verified; actual prerequisite merge, full clean source and coordinated remote evidence still pending.
- **Findings**: 1 critical fixed, 3 warnings (2 fixed, 1 external prerequisite), 1 observation fixed.
- **Previous review**: [Pre-PR implementation review](impl-review-before-pr-ci.md). This review supersedes its statement that no further substantive code findings existed.

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS with documented private-CI/bootstrap clarification |
| Scope Discipline | PASS — no project-edition migration or production rollout |
| Safety & Quality | PASS for independently reviewed fixes; remote execution pending |
| Architecture | PASS — content-bearing tests stay private |
| Pattern Consistency | PASS |
| Success Criteria | WARNING — prerequisite merge, final source pins and private coordinated CI pending |

## Findings

### F1 — Public CI could disclose paid material

- **Severity**: CRITICAL
- **Impact**: MEDIUM — move the material-bearing runner and retain strict cross-repository evidence.
- **Dimension**: Safety & Quality
- **Location**: Original CLI `.github/workflows/ci.yml:150`; Toolkit E2E full-content assertions.
- **Detail**: CLI is public. Its initial workflow would upload the complete private v3 fixture and final v4 bundles as `coordinated-content`; failing E2E assertions could also print private content. Signed-in repository readers can download public Actions artifacts. The initial run failed earlier at missing configuration, and the actual artifact API reports zero artifacts for run `34706552849`; no material was uploaded by that run.
- **Fix**: Run all private-source/material preparation and E2E in private Toolkit. Public CLI downloads only one bounded allowlisted receipt and verifies the canonical successful private run, exact candidate SHAs, both OS conclusions, receipt producer, release/hash identity and run attempt. Fixed error strings avoid echoing private inputs.
- **Decision**: FIXED — independently reviewed. CLI 26 receipt regressions pass; private producer and adjacent evidence checks pass. Actual remote handoff awaits the prerequisite.

### F2 — The manual fixture producer had no bootstrap path

- **Severity**: WARNING
- **Impact**: MEDIUM — bootstrap the standalone producer before dependent CI requires its run.
- **Dimension**: Success Criteria
- **Location**: Toolkit `.github/workflows/prepare-v3-e2e-fixture.yml`; source prerequisite #30; release runbook.
- **Detail**: The new dispatch-only workflow was absent from master and from the Actions workflow registry (404). Both candidate jobs nevertheless required a successful run of that exact producer. A feature-branch file alone did not supply the first required run.
- **Fix**: Extend #30 with the workflow, standalone archive/input verification helpers and tests, including a private-Toolkit-only guard and explicit registration/dispatch order.
- **Decision**: CODE FIXED — #30 head `01232887c36fdffbea5251172c47bbb1f44b9616` has green remote CI and full isolated local CI. Registration still requires its actual master merge.

### F3 — Frozen source and exact coordinated evidence remain prerequisites

- **Severity**: WARNING
- **Impact**: MEDIUM — operator coordination of the source merge and actual remote verification.
- **Dimension**: Success Criteria
- **Location**: Toolkit v3 `sources.ts`; canonical Progress 6.2/6.3.
- **Detail**: Frozen cutoff `da989a6f7d4963c275a98943e85d225baf426228` lacks support documents. #30 now contains both the complete stack-assess tree and all five progress-document repairs. Until merged, its branch SHA must not become a permanent pin. The public CLI's Linux/Windows normal checks passed, but those are not the private coordinated material/auth matrix.
- **Fix**: Coordinate the quiet publication boundary, merge #30, fetch the actual master SHA, add only the required package/file exceptions, run full clean verification, dispatch the private fixture producer, and test the exact candidate pair on Linux/Windows. Public CLI then verifies the sanitized receipt from that successful private run.
- **Decision**: PENDING EXTERNAL PREREQUISITE — after #30 passed checks, the operator explicitly chose to perform its merge themselves. No workflow suspension or merge was executed. `TOOLKIT_READ_TOKEN` was added by the operator; only the secret's existence has been verified so far.

### F4 — CI notification could report green after mandatory failure

- **Severity**: WARNING
- **Impact**: LOW — include every mandatory prerequisite in failure evaluation.
- **Dimension**: Safety & Quality
- **Location**: CLI `.github/workflows/ci.yml`, `notify-slack`.
- **Detail**: Windows or coordinated preparation failure could skip downstream jobs without triggering the notification's failure condition. The same reviewed shell block interpolated a commit message directly into shell source.
- **Fix**: Treat non-success of either OS or the coordinated gate as failure. Pass the commit message through an environment variable instead of shell-code interpolation.
- **Decision**: FIXED — regression asserts mandatory gates; CLI actionlint passed; independently reviewed. No notification was manually sent.

### F5 — Repeated cumulative sync rewrote intermediate variants

- **Severity**: OBSERVATION
- **Impact**: LOW — preserve valid earlier-owner freshness while retaining later precedence.
- **Dimension**: Safety & Quality
- **Location**: CLI `src/lib/writer.ts`, shared-owner invalidation.
- **Detail**: Later lessons invalidated every earlier owner's freshness when generated variants differed. Repeated sync installed each intermediate variant and ended with identical final content; manual PL/Codex run reported 44 updates each time.
- **Fix**: During complete later-lesson writes preserve earlier owners only when language, tool and rules policy agree. Earlier writes, partial updates and representation changes retain invalidation. Global managed hashes still detect missing/edited files.
- **Decision**: FIXED — ten command regressions cover zero repeat writes (including manifest bytes and mtimes), numeric order, upstream changes, filtering, repair, local edits, language, partial writes and rules behavior. Full CLI suite passed. Real E2E now asserts idle repeat-sync across all 18 course/language/profile combinations; **29/29 real E2E PASS**, including all 18 repeat-sync combinations.

## Verification recorded in this PR-fix pass

- CLI: **647 unit/integration tests + 10 smoke PASS**, typecheck, lint, ESM/native builds PASS.
- Private receipt/fixture/input/retained-stage checks: **24 PASS**.
- Actual E2E: **29/29 PASS**, 119.45 seconds, including zero repeat updates and identical complete project snapshots for all 18 course/language/tool combinations. Rebuilt binary SHA-256 `8d140980d3aacb4d4ab782fb7617e9b6588f1177837be1e7705fe37b34f2b958`. Candidate OpenAPI `generate-types --check` PASS.
- Source/bootstrap prerequisite: full isolated `pnpm ci:local` PASS (**475 package + 25 shared-reference tests**); complete v3 lesson build and validators PASS. Actual archive helper verifies all **57 published objects**.
- Prerequisite remote CI: `34707030277`, lint/validate/E2E PASS; production jobs skipped.
- Independent final fix review found no remaining actionable receipt-boundary or writer-convergence issue.

## Evidence and limits

Logs: `/tmp/10x-v4-pr-fixes-cli-{full,types,lint,build,binary,smoke}.log`, `/tmp/10x-v4-pr-fixes-toolkit-gates.log`, `/tmp/10x-v4-pr-fixes-real-e2e.log`, `/tmp/10x-v3-bootstrap-ci-local.log`, `/tmp/10x-v3-bootstrap-fixture-result.json`.

Source pins and main PRs have not been merged. No production rollout is claimed. Canonical Progress remains the only implementation tracker; normal Windows unit/smoke success does not check off the coordinated Windows criterion.
