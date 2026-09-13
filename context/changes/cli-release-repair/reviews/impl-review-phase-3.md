<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Exact-commit CLI release repair

- **Plan**: ../plan.md
- **Scope**: Phase 3 of 4; local implementation and rollout instructions. Hosted proof, credential activation and human merges remain pending.
- **Date**: 2026-09-13
- **Verdict**: APPROVED (local implementation; operational gates remain pending)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS for verified local criteria; hosted/credential/human gates explicitly pending |

## Findings

### F1 — Successful print acceptance needs the required artifact type

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: docs/how-to/release-cli.md, actual-package acceptance commands; src/commands/get.ts:294.
- **Detail**: The example --print command omitted --type, causing invalid_options rather than a successful preview. An unchanged directory after argument rejection would not prove preview immutability.
- **Fix**: Add --type skills and require successful output before comparing complete before/after inventories.
- **Decision**: FIXED by root as a mechanical runbook correction. Actual published-package execution remains pending publication and coordinated login.

### F2 — Reverify retained promotion source ancestry

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: Toolkit packages/api/scripts/lib/publication-policy.mjs, verifyPromotionStage.
- **Detail**: Canonical successful historical push/master metadata alone does not prove the selected commit remains reachable from current master. The user requires master ancestry; promotion must reject a formerly-master orphan without equating tree identity with commit identity.
- **Fix**: Promotion-only fresh master-ref and exact compare/merge-base validation before and after retained metadata/byte checks. Preserve valid historical ancestors and existing Contents-read scopes. Regressions must prove rejection before opening R2, including a mid-verification ancestry change.
- **Decision**: FIXED under the approved identity contract. Independent safety and drift reviewers confirmed closure; no new scope or storage/authorization design.

### F3 — Existing Toolkit internal-package master writer remains outside this repair

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: Toolkit .github/workflows/ci.yml, publish-internal-pkg; packages/internal-pkg/scripts/auto-version.mjs.
- **Detail**: Current package2.44.1/tagv2.44.1 has zero package-affecting path changes through this repair, so no extra version commit is expected. Future payload changes can still advance master after source CI.
- **Fix**: Record the exact current no-op audit and require re-audit if base/branch changes; future source SHA changes require their own exact stage.
- **Decision**: DOCUMENTED in both runbooks and handoff; no unrelated publisher redesign or verifier relaxation.

## Independent review and verification evidence

- Drift reviewer: impl_drift_review, read-only; F1 plus F3 observation, other Phase3 changes MATCH.
- Safety reviewer: phase1_implementation (independent of Phase3 implementation), read-only; F2 only, other safety contracts MATCH. Original safety agent was unavailable because the tool reported an agent-thread limit; reused a reviewer who did not implement this phase.
- Root gate: promotion/retained targeted73PASS. Initial ci:local failed only formatting of the new contract register; root applied the formatter, then full ci:local passed (910 tests across packages, all validators/build/type/lint/format checks). Updated ancestry regressions80PASS. Independent reviewers confirmed all findings closed; Deliberate ancestry break produced6expected failures and was restored from index. Final Toolkit ci:local917tests PASS (API665/course150/internal61/artifact16/shared25), all validators/build/lint/format PASS,7existingwarnings. CLI Phase2 executable/test inputs unchanged;673unit+10smoke/type/lint/build results reused. Scoped diff/privacy review found no credentials, private content or unrelated files.
- Publisher implementation and production policy unchanged; no course selection/auth/entitlement/clock changes. Runtime credentials, hosted exact-pair proof, both PRs and all human/production checks are separate pending gates, not inferred from this local review.

## Hosted Windows follow-up — approved platform correction

First hostedCLI run34756812656/1 caught npmInvocation selecting setup-node's bundled npm instead of the global upgrade; strict11.12.1 regression correctly failed. The follow-up mirrors the official installed npm.cmd: run npm-prefix.js with its Node/cwd/env, prefer the global npm-cli.js, otherwise bundled entry, and pass literal argument arrays without shell interpretation. Version/commit/integrity checks remain unchanged.

Independent drift and safety reviews both APPROVED with no findings. New executable layout regression covers global precedence, bundled fallback, literal metacharacter paths and helper failure. Root target6PASS; deliberate global-precedence break went RED and was unconditionally restored from index; fullCLI674unit+10smoke/type/lint/build/binaryPASS,3existinglintwarnings. ActualhostedWindowsretry remains pending; local approval does not close that gate.


## Hosted Windows smoke follow-up — approved test runtime correction

Independent reviewers impl_drift_review and phase1_implementation both APPROVED without findings. The harness invokes the actual checkout auto-version script using Node, matching production; Git/version writes use isolated fixture cwd. It removes copied-script/NODE_PATH indirection, adds bounded subprocess failure handling, and preserves every assertion and existing OS coverage. No production behavior changed. The exact internal Bun stall cause remains unproven; hosted Windows must confirm the correction.

Root target4PASS; deliberately wrong production minor calculation caused the feature-version assertion to fail, then unconditional index restore. Initial full unit run had an existing auth-status timeout; unchanged retry674unit+10smoke/type/lint/buildsPASS,3existingwarnings. This local review does not replace final hosted source-pair proof.
