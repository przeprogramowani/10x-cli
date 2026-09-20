# Contract Surfaces

> Register of load-bearing names and schemas in this project. `/10x-plan-review` greps plan text against the H2 headings here and flags hits as potential breaking changes.
>
> Each surface entry is an H2. Body should include: canonical definition (file:line), owners/consumers, breaking-change checklist.

## coordinated-receipt

- **Canonical definition**: 10x-toolkit/packages/api/scripts/lib/coordinated-evidence.mjs:5 and packages/api/scripts/public-coordinated-receipt.mjs. Schema2 binds full toolkitSha/cliSha, runId/runAttempt, distinct retained sourceRunId/sourceRunAttempt/sourceArtifactId, leaseGeneration, releaseId/manifestHash and both Linux/Windows. Original producers use their own source run/attempt with null sourceArtifactId/leaseGeneration. Artifacts use `<base>-<runId>-<runAttempt>` and immutable IDs.
- **Owners / Consumers**: Toolkit CI, OS receipt producer, retained-stage verifier, release coordinator and promotion source verifier; CLI scripts/verify-coordinated-receipt.mjs and public CI.
- **Breaking-change checklist**: Update producers, strict field allowlists, both repository consumers, selected-attempt job/artifact checks and operational inputs together. Require fresh exact-commit evidence after squash, version preparation or any later commit; never translate tree equality into commit identity, relabel attempts, fall back to old schemas, delete retained stages or use dispatch as production content authority.

## heads/automation/cli-release-lease

- **Canonical definition**: 10x-toolkit/packages/api/scripts/lib/release-lease.mjs:2 and :16. The private append-only Git ref stores one bounded lease.json (schema1); non-force child-commit updates serialize generation, owner run/attempt, exact pair/source, persisted operation tokens and exact child run/attempt identities.
- **Owners / Consumers**: Toolkit release-coordinator.yml/release-coordinator.mjs; CLI scripts/release-identity.mjs; Session A operational reconciliation.
- **Breaking-change checklist**: Change lease validation and every reader/writer together, including trusted invocation and release-child authorization. Preserve compare-and-swap ownership, recover only after authoritative owner/child inspection, retain ambiguous/partial operations, and never steal by TTL or treat a missing child run as publication authorization. Re-prove contention with an isolated ref before activation after a storage-contract change.

## CLI_RELEASE_AUTOMATION_ENABLED

- **Canonical definition**: 10x-toolkit/.github/workflows/release-coordinator.yml:38 and packages/api/scripts/release-coordinator.mjs (new-generation admission).
- **Owners / Consumers**: Trusted Toolkit coordinator; Session A activation and incident runbooks; CLI release children bound to the acquired generation.
- **Breaking-change checklist**: Missing or any value other than exact `true` blocks new generations under that invocation configuration. Already acquired generations may finish evidence, pointers and publication, including safe adoption. It is not a live kill switch; queued invocation configuration and in-flight children must be inspected. A change to live cancellation semantics requires an explicit operator decision about new capabilities and partial-publication handling; do not add a Variables-read token silently.

## version-preparation

- **Canonical definition**: 10x-cli/scripts/prepare-version.mjs:54, validatePreparationRecord; artifact `version-preparation-<prNumber>-<runId>-<runAttempt>` containing version-preparation.json.
- **Owners / Consumers**: Trusted prepare-version.yml, read-only initial CI bootstrap, scripts/release-preflight.mjs and merged-PR release validation.
- **Breaking-change checklist**: Coordinate schema1/allowlist, trusted producer run/attempt/job/artifact checks, exact input/prepared head/base and published baseline, merged-commit relationship and bootstrap recalculation. Number changes are automatic on the same ordinary code PR and require fresh tests of the resulting commit. Never insert a post-evidence master version commit or replace merge provenance with equivalent trees.

## release-manifest.json

- **Canonical definition**: 10x-cli/scripts/release-identity.mjs:99, releaseManifest; scripts/release-assets.mjs writes it into the retained release-package artifact before registry/tag mutations.
- **Owners / Consumers**: CLI publication workflow, exact binary selection, Toolkit completion verifier via the related published-result.json, and manual partial-release operators.
- **Breaking-change checklist**: Keep exact source/version/tag, pinned npm version, run/attempt/evidence identity, expected pack SHA-512, five binary artifact IDs/hashes and version-preparation provenance aligned. Directory publication is accepted only after actual registry gitHead and downloaded bytes match; mismatch or missing GitHub assets leaves an incomplete release. Never republish an existing npm version or rebuild artifacts for manual completion.

## version-preparation.json workflowSha / inputHead / preparedHead

- **Canonical definition**: scripts/prepare-version.mjs, validatePreparationRecord and loadPreparationForMerge; schemaVersion 1.
- **Owners / Consumers**: .github/workflows/prepare-version.yml producer, scripts/prepare-version.mjs retained-record consumer, scripts/release-preflight.mjs release validation.
- **Breaking-change checklist**: Keep execution SHA distinct from event candidate and prepared version child. Update producer, event-aware run/PR/base binding, exact attempt/artifact/job checks and merged-source/baseline regressions together. PRtarget binds execution to canonical master base and input to associated candidate; master events bind execution to run head. Never drop equality without an independently verified replacement binding.

## retain-tested-stage

- **Canonical definition**: The name of the Toolkit CI job that retains the tested `v4-release` stage, compared as a **runtime string** across two repositories. Two values are accepted and exactly one may appear in any single run attempt: the historical `upload-content` and the current `retain-tested-stage`. Validators: `10x-toolkit/packages/api/scripts/lib/coordinated-evidence.mjs` (`validateAttemptJobs`, a required position may be a string or a set of strings) with the set supplied at `packages/api/scripts/lib/retained-stage-metadata.mjs`; `10x-cli/scripts/verify-coordinated-receipt.mjs` (`validatePlatformJobs`, same semantics) with the set supplied in the `release` branch.
- **Owners / Consumers**: Toolkit `ci.yml` job definition and every consumer naming it in `needs`; the retained-stage verifier; the promotion source verifier; the CLI receipt verifier. Both validators are independent implementations and must move together.
- **Breaking-change checklist**: The old name **stays accepted permanently** — already-retained stages are historical runs whose job carries whichever name was current when they ran, and removing the old value silently makes every one of them unverifiable. Widen both validators **before** renaming the job, never after; a rename landing first invalidates verifiability of every retained stage. Keep `length === 1`: a run exposing both names is a conflict, not a pass, because it means two retention jobs ran and neither is authoritative. Adding a third accepted value requires the same two-step across both repositories.
