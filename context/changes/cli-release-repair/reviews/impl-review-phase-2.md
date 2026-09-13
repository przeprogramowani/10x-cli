<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: exact-commit release evidence and automation

- **Plan**: ../plan.md
- **Scope**: Phases 1–2 of 4; Phase3 consumers/runbooks remain pending
- **Date**: 2026-09-13
- **Verdict**: APPROVED after corrected-source gates
- **Findings**: 0 unresolved; 1 critical and 4 warnings corrected

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (local automated scope) |

## Findings

### F1 — Coordinator adoption bypasses trusted-master validation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix preserves the approved trusted-master boundary
- **Dimension**: Safety & Quality
- **Location**: Toolkit .github/workflows/release-coordinator.yml:19; packages/api/scripts/release-coordinator.mjs:44
- **Detail**: A branch workflow_dispatch receives writer credentials. Existing nonterminal-lease adoption bypasses validateWake, which only runs on new acquisition.
- **Fix**: Canonical repository/master job guard before checkout and invocation provenance check for every runtime path, including adoption. Add zero-mutation non-master adoption regression.
- **Decision**: FIXED within approved design; independently re-reviewed and verified by root gates.

### F2 — Recovery consumes the sole wake for a newer master pair

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — bounded correction within the approved reconciliation state machine
- **Dimension**: Plan Adherence
- **Location**: Toolkit packages/api/scripts/release-coordinator.mjs:95,387
- **Detail**: A new coordinator adopts an interrupted old pair, waits for its child, returns obsolete and exits. The newer-pair wake is consumed with no guaranteed later trigger.
- **Fix**: Bounded current-pair reconciliation after obsolete/terminal older work, honoring new-generation admission; manual completion remains a stop.
- **Decision**: FIXED within approved design; independently re-reviewed and verified by root gates.

### F3 — Commit scope suppresses real package changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — remove redundant scope filter
- **Dimension**: Plan Adherence
- **Location**: CLI scripts/auto-version.mjs:31
- **Detail**: All chore(release) commits are excluded, including shipped source/skills or BREAKING CHANGE. The plan excludes content that changes only the generated version.
- **Fix**: Use the existing content filter, retain package-affecting changes regardless of scope, and add real-Git regressions.
- **Decision**: FIXED within approved design; independently re-reviewed and verified by root gates.

### F4 — Baseline completion reads Actions with the version-write token

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — separate existing read and write credentials
- **Dimension**: Safety & Quality
- **Location**: CLI scripts/prepare-version.mjs:107; .github/workflows/prepare-version.yml:52
- **Detail**: Actual run/job validation uses RELEASE_TOKEN, whose approved capabilities are Contents write and PR read. Actions read is not part of that grant.
- **Fix**: Use the job GITHUB_TOKEN with Actions read for read-only release-run validation; retain RELEASE_TOKEN solely for the existing PR preparation API. No new external token or expanded writer scope.
- **Decision**: FIXED within approved design; independently re-reviewed and verified by root gates.

### F5 — Mutation 404 is silently treated as a missing read

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — narrow HTTP adapter correction
- **Dimension**: Safety & Quality
- **Location**: CLI scripts/release-github.mjs:10; Toolkit packages/api/scripts/release-coordinator.mjs:153
- **Detail**: All 404 responses return null, including mutation failure. A variable deleted between GET/PATCH can leave an incomplete pointer set and continue dispatch; a missing workflow dispatch is misreported as ambiguous delivery.
- **Fix**: Only GET 404 returns null; mutation 404 throws a sanitized error. Exercise actual adapters.
- **Decision**: FIXED within approved design; independently re-reviewed and verified by root gates.

## Evidence and remaining gates

Two independent reviewers found the issues above without edits or remote mutations. Root gates on the reviewed candidate passed: CLI671 unit +10 smoke/type/lint/node+binary builds; Toolkit ci:local (API630, course150, internal61, artifacts16, shared25) and all validators. Deliberate-break removed gitHead comparison, observed the regression fail, then restored from index. Those green suites do not override these uncovered review findings. No Phase2 commit, PR, activation or publication is claimed. Root will record corrected-source checks and reviewer revalidation before approval.

## Corrected-source closure

Both independent reviewers closed F1–F5 with no remaining critical finding. Root final gates:CLI673unit+10smoke PASS, typecheck/lint(3existingwarnings)/node+binarybuilds PASS; Toolkit Node22 ci:local PASS (API637/course150/internal61/artifact16/shared25 =889 tests,7existingwarnings, allvalidators). Actionlint1.7.12 syntax/expression checks PASS for both CI and coordinator/version workflows; optional shellcheck/pyflakes subprocess integration was disabled, not workflow validation. Actionlint first caught runner.temp in invalid job env; first-step GITHUB_ENV correction passed revalidation. A new fetch mock initially failed Bun typecheck; preserving preconnect fixed its type without changing assertions. Root deliberately removed the invocation guard and observed both noncanonical-adoption tests fail, then unconditionally restored from index. Original gitHead break-check also passed. Hosted execution/credentials/actualpackage remain later gates, not findings misrepresented as locally verified release.
