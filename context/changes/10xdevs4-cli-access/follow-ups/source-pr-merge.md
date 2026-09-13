# Reviewable source-prerequisite merge procedure

This is a deferred operational proposal, not an execution tracker. Canonical plan
Progress remains authoritative. No workflow suspension or merge has been performed.
Immediate merge is not required for independent v4 candidate verification. The
earlier workflow-suspension question is deferred; request that decision only when
the actual master pin is the remaining prerequisite for final verification.

## Prepared input

- PR: https://github.com/przeprogramowani/10x-toolkit/pull/30 (draft).
- Expected head: `e6e9f3f2e807d14019f0fe5cd087554f7dbd7864`.
- Branch: `fix/stack-assess-reference-closure`; base: `master`.
- Local `pnpm ci:local`: PASS (491 tests and content/build/style checks).
- GitHub CI run `34690381690`: SUCCESS, including CLI/API E2E.
- The separate delivery implementation has 134 passing course-content tests,
  including master ancestry/squash regressions; it is not part of this PR.

## Boundary requiring coordination

The original implementation instruction forbids production writes, deployments
and notifications and excludes executing phase 7. The user subsequently approved
the separate source-prerequisite PR and squash-compatible dependency sequence.
Master's existing automation would turn its merge into production R2 uploads,
package publication, a Worker deployment and notifications. The offline artifacts
workflow also updates public release ZIPs. Those effects are not part of the
approved source correction.

A bounded way to merge source only is to temporarily suspend these two workflows:

| Workflow | ID | Observed state |
| --- | --- | --- |
| CI (`.github/workflows/ci.yml`) | `256790424` | active |
| Build offline artifacts (`.github/workflows/build-artifacts.yml`) | `279411293` | active |

Do not change production bindings or credentials, bypass required PR reviews,
modify branch protection, cancel unrelated runs, or execute phase-7 rollout.

## Proposed sequence after suspension is authorized

1. Finish PR review and required checks; marking the draft ready may schedule
   Impl Review. Recheck exact head and successful checks after any reviewer edits.
2. Record current workflow states. Suspend the two workflows above, then verify
   suspension and inspect all queued/running/waiting runs. Wait for unrelated
   active runs to finish; do not cancel them without separate authorization.
3. Once no old writer can act, squash-merge only PR #30 with an exact expected-head
   check. Stop on head changes or unmet branch protection; never use an admin bypass.
4. Restore each workflow's recorded enabled state in unconditional cleanup, and
   verify no production job was created for this merge. Record the master merge SHA.
5. Fetch complete origin/master history. Verify the resulting SHA is a commit and
   an ancestor of origin/master. It must differ from a discarded PR SHA after squash.
6. Resume the delivery work, integrate the source prerequisite, and set only the
   approved v3 stack-assess package exception to that verified full master SHA.
   Retain the original v3 cutoff. Run the remaining phase-3 gates; all Manual and
   phase-7 criteria remain open.

This proposal does not silently authorize the workflow suspension. It makes the
remaining repository-setting change and its cleanup concrete for the operator.
