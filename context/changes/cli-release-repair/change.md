---
change_id: cli-release-repair
title: Repair exact-commit CLI release evidence after merge
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Repair the post-merge CLI release process and complete every authorized verification step up to the next concrete human merge or production-promotion gate.

Session A owns coordinated candidate variables and evidence-run pointers. CLI worktree: `/Users/admin/code/10x-cli-release-repair`, branch `fix/cli-v4-release-evidence`, base `b0c789af70f30255fb05149ad86f8534f96c2cb6`. Toolkit companion: `/private/tmp/10x-toolkit-release-repair`, same branch name, base `39925ab6155c9c17fbdabd69d160b5f4fe928c4e`. Both bases freshly fetched on 2026-09-13. Unrelated worktrees and planning artifacts remain untouched.

This bounded repair follows [10xdevs4-cli-access](../10xdevs4-cli-access/plan.md); its existing product decisions and Phase 4/7 obligations remain authoritative. It does not reset historical Progress or transfer ownership of migration, Circle login or EDU ZIP work.

Human architecture checkpoint remains explicit: choose the concrete design, review and approve the plan before `/10x-goal-implement`. The operator performs merges and separately approves production content enablement/promotion. Full operational access reaffirmed by the operator; routine reads, preparation and validation proceed without additional permission questions.

## Authoritative decisions — applied export

Operator export SHA-256: `792e4b3ba300d81e5db00f5e12dbc899eb585d6ba27639fc4411ffc871d1ddc6`. Coordinator already ran dry-run and apply through `.tmp/changes/cli-release-repair-344449df/config.json`: saved 8, conflict 0, rejected 0. Session A verified the actual export and applied owner fields; no regeneration or reapply.

Final choices: **D01 C, D02 A, D03 A, D04 B, D05 A with authoritative automation comment, D06 C, D07 C, D08 A**. The earlier manual-version recommendation is superseded: version is calculated automatically and prepared in the existing code PR, with no separate numbering approval. The ordinary human code merge remains. D01 C reverses bootstrap order to CLI first, Toolkit second and retains a real Toolkit companion PR prerequisite for later CLI-only work. D04 B adds a trusted central coordinator and durable lease. D06 C publishes the directory then compares registry integrity. D07 C uses manual verified partial completion.

## Planning revision and process

`10x-plan` resumed from actual applied decisions, with targeted independent feasibility research. New supplement: decision-alignment-research.md. The plan/brief are revised; the canonical targeted independent `10x-plan-review` now reports **SOUND**, all five dimensions PASS, no unresolved findings after two corrections. The report explicitly supersedes the earlier review. Implementation remains unapproved; all Progress items remain pending. Retired incompatible criteria retain unused IDs, and newly scoped criteria receive new IDs.

Earlier `10x-new`/`10x-research` artifacts remain history. No new framing interview is needed: the operator supplied the eight decisions and authorized this exact planning revision. No implementation clipboard command, `10x-goal-implement`, remote dispatch, publication or promotion is authorized by this export. Finish this stage with the concrete reviewed plan, its SHA-256 and any essential unresolved operator decisions.

Operator reported auth-access-resilience complete and archived in main EDU commit 71882433. This is coordination status only; no new dependency or EDU action is introduced.

## Planning handoff complete

Corrected plan SHA-256: `f46f2c7789a2a1844af076198ceb3c9d2dae877a7a465cdd4ffce5ef4168fb59`. Review: [reviews/plan-review.md](reviews/plan-review.md). No additional design decision is needed for this planning revision; explicit approval of this concrete plan is the implementation gate. Scoped automation activation and real release/content verification remain later prerequisites.

## Implementation authorization

2026-09-13: Operator instructed “Działaj zgodnie z 10xWorkflow/10x-goal-implement”, approving the corrected reviewed plan with SHA-256 `f46f2c7789a2a1844af076198ceb3c9d2dae877a7a465cdd4ffce5ef4168fb59`. Session A explicitly invokes 10x-goal-implement from Phase 1. Earlier unapproved statements describe planning history and are superseded by this authorization. Human merge, coordinated login and production-promotion gates remain. Structural deviations still return to the operator.
