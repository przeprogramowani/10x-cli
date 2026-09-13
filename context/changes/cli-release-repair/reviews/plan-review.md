<!-- PLAN-REVIEW-REPORT -->
# Plan Review: exact-commit CLI release after operator decisions

- **Plan**: ../plan.md
- **Plan SHA-256**: `f46f2c7789a2a1844af076198ceb3c9d2dae877a7a465cdd4ffce5ef4168fb59`
- **Decision Record SHA-256**: `792e4b3ba300d81e5db00f5e12dbc899eb585d6ba27639fc4411ffc871d1ddc6`
- **Mode**: Deep, targeted independent review plus parent verification
- **Date**: 2026-09-13
- **Reviewer**: /root/revised_plan_review; parent Session A
- **Verdict**: SOUND after targeted corrections
- **Findings**: 0 unresolved critical, 0 unresolved warnings; 2 warnings fixed and 2 contract clarifications included
- **Authorization**: Planning review only. No implementation or production approval.

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

Grounding: 6/6 existing paths verified; producer/consumer symbols traced; brief and plan agree. Relevant symbols include validateProducerRun, verifyCandidateCheckout, testedStageReceipt and validateGreenBuild/validateGreenStage. Existing paths include CLI ci.yml, auto-version.mjs, verifier and declaration, smoke package tests and Toolkit publication runbook. Newly proposed helpers/workflows are explicitly labeled new.

Progress: exactly one bottom Progress block, four matching phase titles, 19 success criteria matched one-for-one, no body checkboxes and no completed implementation rows. Retained step titles remain unchanged; retired 2.1/2.3/3.4 IDs were not reused. Parent script independently confirmed both decision-file hashes unchanged and all eight owner-field sets equal the actual export. Source validator: `OK: 8 decyzji w obu plikach.`

Blast-radius sweep includes promotion's fixed artifact selection, r2-sync/publication-policy consumers and the existing prepare-v3-fixture-artifact importer of verifyV3Fixture; preserve that signature. No contract register currently exists. No new product/auth/EDU dependency was found.

## Findings

### F1 — Initial automation activation was not guarded

- **Severity**: WARNING
- **Impact**: LOW — narrow activation contract correction
- **Dimension**: Blind Spots
- **Location**: D04 coordinator and merge sequence
- **Detail**: The first Toolkit master success could start coordination before credentials and lease contention had been verified.
- **Fix**: Default-inactive CLI_RELEASE_AUTOMATION_ENABLED guard checked before coordination writes/dispatches; Session A activates only after prerequisite checks and explicitly requests reconciliation. Active children remain recoverable if new starts are disabled.
- **Decision**: FIXED in plan; independently rechecked. This is a planning correction, not an activation performed by this session.

### F2 — Private lease reader lacked an explicit credential scope

- **Severity**: WARNING
- **Impact**: LOW — specify the already-required read contract
- **Dimension**: Plan Completeness
- **Location**: D04 credential matrix
- **Detail**: The trusted CLI release job must validate a Toolkit Git-ref lease, but Actions dispatch permission alone does not grant Contents read.
- **Fix**: Specify Toolkit Contents read on TOOLKIT_DISPATCH_TOKEN, bounded allowlisted lease reads from trusted master code, no candidate credential access and explicit repository-wide scope limitation.
- **Decision**: FIXED in plan; independently rechecked. Token provisioning/capability verification remains an implementation-activation prerequisite.

## Additional contract clarifications verified

- Squash changes history: numbering provenance binds a trusted preparation workflow/run/attempt, exact artifact, input/resulting PR head, base and published baseline. Bootstrap recomputes from trusted newly merged helper against original PR objects. This record does not replace fresh post-squash commit evidence.
- A successful published-baseline advancement also reconciles open PR preparation without requiring another head/base commit; the plan requires that regression.

## Selection fidelity and feasibility

D01 C's CLI-first bootstrap works for this paired repair using the existing exact Toolkit PR path. The plan explicitly retains the real Toolkit companion-PR prerequisite for future CLI-only pre-merge tests; no silent dispatch PR mode or evidence weakening. D05 honors the operator's comment with automatic same-code-PR numbering and ordinary human code merge, not separate version acceptance. D04 B includes two-source wake-up, durable ownership and permission/activation checks. D06 C acknowledges repacking and post-publish integrity detection; D07 C keeps verified manual partial completion with no second npm publish. D08 and production authorization/time gates remain intact.

No further operator design choice is necessary to finish this planning revision. Approval of this exact concrete plan remains required before implementation. Live GitHub lease contention, credential capabilities, real CLI directory-pack regressions, actual published package and production acceptance are still future evidence, not established by this review.
