# Source closure required before Phase 3 can resume

This is a diagnostic scope proposal, not an additional execution tracker. Canonical Progress remains authoritative. The selected complete-document correction is prepared locally; it still needs an independently merged source prerequisite before a permanent maintenance pin can be assigned.

## Evidence

At Toolkit cutoff `da989a6f7d4963c275a98943e85d225baf426228`, `packages/ai-artifacts/skills/10x-stack-assess/` contains only SKILL.md and references/agent-friendly-criteria.md. SKILL.md directs the consumer to load that reference; its lines 5–7 point to absent decision-flow.md and starter-registry.yaml and prescribe reading starter booleans. The enforcement section is greenfield selection behavior, whereas stack-assess must evaluate an existing project without recommending replacement. The available history has no corrected criteria version to pin. The builder correctly fails the dangling dependency check.

## Proposed bounded correction

Prefer making the shared agent-friendly-criteria reference neutral: retain the four definitions, the per-language-family qualification and compensation guidance; keep greenfield registry selection/filtering instructions in the selector's existing decision-flow/registry documentation. Update both consuming copies together and enforce byte identity in an applicable validate:* check, following the accepted self-contained-reference lesson. Verify that each skill's instructions remain sufficient for its distinct task. No skill names, lesson membership or first-week schedule need change.

A narrower alternative is a separately named brownfield-specific reference consumed by stack-assess, retaining the four criteria and compensation guidance without the greenfield registry dependencies. This avoids pretending that two intentionally different documents are shared byte-identical copies, but introduces another maintained reference contract.

## Immutable-source consequences

Corrected artifact bytes need an explicit immutable source revision before the final source build can use them; do not read uncommitted filesystem bytes or silently copy files across pinned package trees. V4 continues to use the selected latest publication source. The approved v3 cutoff stays fixed. Because the common source validator also inspects local frozen-v3 fixtures, any correction applied to those source builds requires an explicit reviewed maintenance exception rather than silently moving v3's cutoff or relaxing validation. Neither option authorizes changing live v3 R2 objects, pushing/merging, or publishing.

## Resume verification

After resolving artifact-source scope and the required immutable revisions, resume Phase 3 at criterion 3.1. Re-run the scoped build, actual EN/PL transformation and final curriculum validation, then all remaining Phase 3 plan gates, the isolated actual-publisher R2 trial, deliberate-break checks, full repository checks and exact-file commits. Current uncommitted implementation and the existing user approvals should be preserved. Do not treat the earlier binding preflight as final publisher certification.


## User resolution — 2026-09-12

The user selected complete document inclusion in stack-assess. Implement all six selector reference documents as local, byte-identical stack-assess copies; preserve stack-assess's existing SKILL.md and brownfield purpose. The earlier rewrite alternatives above are historical proposals, not the selected approach. Record the verified immutable prerequisite revision and the explicit stack-assess package maintenance exception for fixed-cutoff v3 source builds in evidence.md; publication remains outside this task.


## Squash-safe dependency — 2026-09-12

The user approved a separate source-prerequisite PR, followed by the main delivery
PR referencing the resulting master commit. This supersedes the earlier idea of
pinning a local prerequisite commit: squash would not retain it in master history.
The original v3 cutoff remains unchanged. Do not add its stack-assess maintenance
pin until the separate PR has actually merged and its master SHA has been fetched.

Permanent default/package/file pins now require full commit identity and ancestry
in complete `refs/remotes/origin/master` history; `latest` remains a once-resolved
candidate selection. Regression tests must cover a pre-squash commit that still
exists locally but is not an ancestor of master, as well as the accepted resulting
squash commit. Toolkit/CLI lessons and the Toolkit source-pin guide capture this.

Current master CI automatically uploads content, deploys the Worker, publishes the
internal package and sends notifications after merge. The prerequisite merge must
respect the approved quiet boundary; preparing its patch/PR is not permission to
execute those production effects. Phase 3 gates remain pending until its actual
immutable source dependency is available.


## Prepared prerequisite

Draft Toolkit PR #30: https://github.com/przeprogramowani/10x-toolkit/pull/30
(`e6e9f3f2e807d14019f0fe5cd087554f7dbd7864`, branch
`fix/stack-assess-reference-closure`). Full local CI passed on the isolated master
base. This is a review-candidate SHA only; wait for the resulting master commit
before adding the maintenance pin. Canonical evidence.md records verification.
