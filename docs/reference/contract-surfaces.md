# Contract Surfaces

> Register of load-bearing names and schemas in this project. `/10x-plan-review` greps plan text against the H2 headings here and flags hits as potential breaking changes.
>
> Each surface entry is an H2. Body should include: canonical definition (file:line), owners/consumers, breaking-change checklist.

## coordinated-receipt

- **Canonical definition**: 10x-toolkit/packages/api/scripts/lib/coordinated-evidence.mjs:5 and packages/api/scripts/public-coordinated-receipt.mjs. Schema2 binds full toolkitSha/cliSha, runId/runAttempt, distinct retained sourceRunId/sourceRunAttempt/sourceArtifactId, leaseGeneration, releaseId/manifestHash and both Linux/Windows. Original producers use their own source run/attempt with null sourceArtifactId/leaseGeneration. Artifacts use `<base>-<runId>-<runAttempt>` and immutable IDs.
- **Owners / Consumers**: Toolkit CI, OS receipt producer, retained-stage verifier and promotion source verifier. The CLI is no longer a consumer: its receipt verifier and the lease it served were deleted when publication moved onto the CLI's own master push.
- **Breaking-change checklist**: Update producers, strict field allowlists, both repository consumers, selected-attempt job/artifact checks and operational inputs together. Require fresh exact-commit evidence after squash, version preparation or any later commit; never translate tree equality into commit identity, relabel attempts, fall back to old schemas, delete retained stages or use dispatch as production content authority.

## npm publish gate

- **Canonical definition**: `10x-cli/scripts/publish-npm-verify.mjs`, `classifyPublishGate` and `GATE_REASONS`; surfaced as the `proceed`, `reason` and `version` outputs of the `publish` job in `.github/workflows/publish-npm.yml`, re-exported as that workflow's `workflow_call` outputs.
- **Owners / Consumers**: `ci.yml`'s `release` job (the only automatic publisher), the `publish-npm.yml` dispatch hatch, and `ci.yml`'s `notify-slack`, which reads the three outputs to tell a publication from a push that carried no version bump.
- **Breaking-change checklist**: The three verdicts are load-bearing and asymmetric by trigger. `published` (registry 404) and `resumed` (registry holds the version from this exact `gitHead`) both proceed; `version-already-published-from-other-sha` is green-and-skipped on a push and a hard failure on a dispatch, because a push with no bump is ordinary while a dispatch naming that version is an operator assertion the registry contradicts. Never make a conflict fail a push — every unbumped master commit would turn master red. Never republish an existing version to resolve one. Adding an output means updating the job outputs, the `workflow_call` outputs and the notification together; the gate writes them in one `GITHUB_OUTPUT` append that a test pins character for character.

## version-preparation

- **Canonical definition**: 10x-cli/scripts/prepare-version.mjs:54, validatePreparationRecord; artifact `version-preparation-<prNumber>-<runId>-<runAttempt>` containing version-preparation.json.
- **Owners / Consumers**: Trusted prepare-version.yml and the read-only initial CI bootstrap (`version-bootstrap`). The record is read back through `readArchiveMember` in scripts/read-artifact-archive.mjs.
- **Breaking-change checklist**: Coordinate schema1/allowlist, trusted producer run/attempt/job/artifact checks, exact input/prepared head/base and published baseline, merged-commit relationship and bootstrap recalculation. Number changes are automatic on the same ordinary code PR and require fresh tests of the resulting commit. Never insert a post-evidence master version commit or replace merge provenance with equivalent trees.

## version-preparation.json workflowSha / inputHead / preparedHead

- **Canonical definition**: scripts/prepare-version.mjs, validatePreparationRecord and loadPreparationForMerge; schemaVersion 1.
- **Owners / Consumers**: .github/workflows/prepare-version.yml producer and scripts/prepare-version.mjs retained-record consumer.
- **Breaking-change checklist**: Keep execution SHA distinct from event candidate and prepared version child. Update producer, event-aware run/PR/base binding, exact attempt/artifact/job checks and merged-source/baseline regressions together. PRtarget binds execution to canonical master base and input to associated candidate; master events bind execution to run head. Never drop equality without an independently verified replacement binding.

## retain-tested-stage

- **Canonical definition**: The name of the Toolkit CI job that retains the tested `v4-release` stage, compared as a **runtime string** across two repositories. Two values are accepted and exactly one may appear in any single run attempt: the historical `upload-content` and the current `retain-tested-stage`. Validators: `10x-toolkit/packages/api/scripts/lib/coordinated-evidence.mjs` (`validateAttemptJobs`, a required position may be a string or a set of strings) with the set supplied at `packages/api/scripts/lib/retained-stage-metadata.mjs`; the CLI's second implementation was deleted with its receipt verifier, so the Toolkit validator is now the only one.
- **Owners / Consumers**: Toolkit `ci.yml` job definition and every consumer naming it in `needs`; the retained-stage verifier; the promotion source verifier.
- **Breaking-change checklist**: The old name **stays accepted permanently** — already-retained stages are historical runs whose job carries whichever name was current when they ran, and removing the old value silently makes every one of them unverifiable. Widen both validators **before** renaming the job, never after; a rename landing first invalidates verifiability of every retained stage. Keep `length === 1`: a run exposing both names is a conflict, not a pass, because it means two retention jobs ran and neither is authoritative. Adding a third accepted value requires the same two-step.
