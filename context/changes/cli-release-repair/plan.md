# Repair exact-commit CLI release evidence

## Overview

Revision aligned to the operator's exported Decision Record on 2026-09-13. **Implementation approved by the subsequent explicit 10x-goal-implement instruction; human merge, login and production-content gates remain.** The authoritative export SHA-256 is `792e4b3ba300d81e5db00f5e12dbc899eb585d6ba27639fc4411ffc871d1ddc6`. The coordinator already applied all eight decisions (saved 8, conflict 0, rejected 0); this revision neither reapplies the record nor edits decision-owner fields.

Canonical implementation Progress lives only here. The original planning stage ended with the corrected plan and independent review. The subsequent implementation authorization and two approved amendments (PR-read scope and admission-only activation) are recorded in change.md and implementation-run.md. The export itself did not authorize implementation.

## Current State Analysis

Fresh fetch on 2026-09-13 still gives CLI `b0c789af70f30255fb05149ad86f8534f96c2cb6` and Toolkit `39925ab6155c9c17fbdabd69d160b5f4fe928c4e`. The private successful run `34743867441/1` proves pre-squash CLI `c139ac5d89bc935be67174cc031e96f62661036d`; CLI run `34745146982/1` correctly rejects it. OS receipts omit run/attempt, artifact names are fixed, and the current version job creates an untested master commit after the evidence gate.

The earlier production inspection found no v4 objects/pointer/lock, disabled publication policy and npm latest 1.20.0. Those are timestamped observations in [handoff](release-handoff.md), not renewed production assertions. Full baseline tests were 647 PASS; no repaired implementation exists. Read-only branch-protection and rules queries returned no rules in either repository; the human-merge boundary is an operator instruction, not an inferred GitHub protection guarantee.

Source findings: CLI `ci.yml` accepts Toolkit PR evidence before CLI merge; Toolkit `ci.yml` checks out the exact transient CLI candidate without requiring it on master. `auto-version.mjs` currently anchors to candidate package.version and is not repeat-safe on a PR. Its existing Angular bump rules calculate **1.21.0** from v1.20.0 and #38; this is a computed example, not a human version choice. `src/index.ts` embeds package.json version at build time. A synthetic npm 11.12.1 loopback-registry experiment confirmed directory publish adds registry gitHead and can produce bytes identical to prior npm pack; the real package still needs regression and registry verification.

## Desired End State

The operator merges code PRs as usual without choosing or separately approving version numbers. Automatic preparation commits the computed version to the same CLI PR before its final tests. An automatic cross-repository coordinator then obtains fresh Linux/Windows evidence for the exact human-merged pair and publishes the CLI directory from that exact SHA. Tag, registry gitHead, package version and binaries identify that tested commit; post-publish download proves integrity against the pre-publish pack. A mismatch is an incomplete release, never success or a reason to republish.

Fresh evidence re-tests retained bytes from a successful canonical Toolkit push/master at the same Toolkit SHA. Receipt run/attempt and source-stage run/attempt remain distinct and strict. Public logs/downloads contain only bounded sanitized receipts and public release manifests. No old artifact is deleted or relabeled. Production content approval and actual downloaded-package v4 acceptance remain separate gates; Session C stage 1 remains unsatisfied until its delivery evidence exists.

## Accepted decisions and scope

| Decision | Final selection and interpretation |
|---|---|
| D01 C | Existing Toolkit PR path proves exact transient PR pairs; new evidence dispatch is release-only. Bootstrap merges CLI first, then Toolkit. No dispatch PR mode or equivalent-tree exception. |
| D02 A | Evidence dispatch stays in canonical Toolkit ci.yml; transformation, deploy, publish and notifications remain push-only. Orchestration is a separate trusted workflow. |
| D03 A | Retain a stage for every successful Toolkit master, use attempt-specific artifacts and require the complete selected attempt. Fresh dispatch is the normal retry; complete reruns remain supported. |
| D04 B | Automatic chain with a durable cross-repository lease; react to either CLI master advancement or successful Toolkit master CI. Session A owns bootstrap/activation and all manual coordination; automation becomes the sole runtime writer after handover. |
| D05 A + comment | Automate the version in the same code PR using existing bump rules. No separate version PR, numerical approval or release-time master commit. The operator comment takes precedence over the card's earlier manual-version recommendation. |
| D06 C | Publish the directory from exact tested checkout with pinned npm; retain a pre-publish pack and compare the actual registry bytes afterward. Accept detection after publication rather than the former single-tarball prevention guarantee. |
| D07 C | Refuse any second npm publish of an existing version. Retain evidence and document manual completion of missing GitHub assets; no automatic recovery workflow. |
| D08 A | Verify downloaded npm/v3 after publication and approved login; promote content separately, then verify v4 identity and real-time unlock. |

D05 authoritative comment: “chcę za wszelką cenę uniknąc manualnego akceptowania wersji, jeżeli możemy to utrzymać w podobnym stanie jak działało lub inaczej zapewnić automatyzację bez wzrostu złożoności - zróbmy to”. Moving the existing writer before the human code merge is the smallest coherent interpretation. Literal zero new logic is incompatible with removing the current identity defect; reuse the current bump library instead of adding a release service. A normal code merge includes the bot's version change, but there is no extra approval step for that number.

**Scope:** release workflows/helpers/tests, automatic same-PR version preparation, central release coordination/lease, documentation/contracts/lessons, two repair PRs and subsequent authorized evidence. No course-selection/auth/entitlement/clock/curriculum changes, no EDU actions, no R2 publisher redesign, no merge queue, no auto-merge, no direct master writer, no automatic content promotion, no external archive service. auth-access-resilience completion/EDU commit 71882433 is coordination information only and adds no prerequisite.

## Implementation approach

### D01 C: exact PR proof and reversed bootstrap

Freeze CLI PR head Cpr after automatic version preparation. Toolkit repair PR head Tpr tests Cpr through its existing CLI_CANDIDATE_SHA path. CLI verifies that exact same-repository Toolkit PR run and both platforms. These are transient candidates, never permanent master pins. Human merges CLI first to Cm. Its old Cpr receipt cannot release Cm; publication waits/fails closed while the Toolkit workflow prerequisite is absent. Re-test Toolkit PR Tpr against Cm, then human merges Toolkit to Tm. A successful push/master at Tm retains its stage; release-only evidence dispatch re-tests it against Cm.

For later CLI-only work, D01 C requires a **real live Toolkit companion PR** for pre-merge proof. Do not manufacture no-op PRs, resurrect merged PRs, disable the check, or silently add dispatch PR mode. That limitation is part of this selected design. If CLI-only releases without such a companion become required, return for a targeted D01 decision; the current paired repair has a feasible path.

### D05: deterministic same-PR version preparation

Reuse/refactor auto-version.mjs into calculation and explicit write entry points. Pin baseline to the latest successfully published stable release/tag on fetched master, validate tag/registry gitHead and immutable baseline, and calculate from that baseline through candidate head. Never use a bot-mutated candidate package.version as the baseline. Exclude generated version-only commits and version-only package.json differences from release detection; preserve existing major/minor/patch rules and evaluate package-affecting paths. Add skills/ and build/public-package inputs to the explicit release-input audit if existing src/package.json filtering omits shipped changes; do not infer release solely from docs churn.

A trusted base-branch workflow handles same-repository PR events and base advancement. It reads PR Git objects as data, executes only trusted master scripts/dependencies in a separate directory, and writes only the calculated package.json version to that same PR head with an expected-head check and fast-forward update. Reject forks, closed PRs and stale head/base; never execute/install candidate code with a write token or force-push. Use scoped RELEASE_TOKEN (or its scoped replacement) so the new commit triggers ordinary CI; do not rely on GITHUB_TOKEN event recursion. Idempotent repeat is a no-op; changed head/base/release baseline invalidates preparation and previous exact-pair evidence. Validate again at merge/release: stale version means stop and automatically prepare a follow-up ordinary code PR only if separately authorized; this repair never silently creates or merges one.

Before the new workflow exists on master, Session A runs the same automatic calculation while preparing the initial repair PR. This bootstrap does not ask the operator to select 1.21.0. The normal human code merge remains mandatory. Record source head, base, release tag/SHA and calculation result; no commits after the final proof can reuse that proof.

Squash can change commit-message history as well as SHA. Release validation uses the version-preparation record for the exact merged PR head, verifies GitHub's merged-commit relationship and the committed version in Cm, and requires the same published baseline. It does not recompute a potentially different bump from the squash message and silently rewrite the version. Fresh Cm evidence remains independently mandatory; the preparation record is numbering provenance, not a substitute for source identity.

The bounded preparation record names canonical trusted prepare-version.yml run/attempt, input PR head, resulting version-prepared PR head, base SHA, published baseline version/tag/SHA, calculated number and exact artifact ID. Verify successful producer jobs, current attempt and all identities before using it; reject a record supplied by PR code or mismatched artifact. Initial repair bootstrap, before that workflow exists on master, records the same calculation and inputs in a retained CI artifact and verifies the calculation again from the newly trusted master helper after the human merge, against the original PR Git objects. No pre-merge local file alone authorizes a release.

Version preparation also reconciles open PRs after a verified successful CLI release advances the published baseline, even without a new head/base commit. Use trusted CI workflow completion with validated release result, not an assumed release-event recursion from GITHUB_TOKEN. Include a regression for this ordering; no-op calculations cannot create bot loops.

### D02/D03: fresh evidence and retained stages

Add release-only workflow_dispatch to Toolkit ci.yml, on master. Inputs carry exact CLI/Toolkit SHAs, original successful push/master run and attempt, stage artifact ID, release ID/hash, and coordinator lease generation. Validate workflow SHA = requested Toolkit SHA = retained-stage source and require both requested source SHAs on fetched master; release requests must still match the selected current master pair before publication. Snapshot inputs once; don't reread mutable candidate vars in later jobs.

Dispatch downloads and verifies retained bytes and exact archive membership, reruns Linux/Windows E2E/OpenAPI and produces new OS/public receipts. It cannot transform content, publish packages, deploy Workers, promote R2 or send notifications. Ordinary Toolkit PR/push tests remain available; their producer receipts bind run/attempt too. Retain every successfully tested master stage independently of API/docs/content diff filtering. Keep the vetted v3 fixture path and source-cutoff rules intact.

Revise producer/consumer schema together; strict field allowlists, full SHAs, run ID/attempt and release/hash. Select artifacts by exact ID plus expected attempt-specific name and selected-attempt successful jobs. Reject duplicate, stale, partial, mixed, expired, relabeled or changing-run evidence and archive extras. Complete reruns are allowed only with all selected-attempt jobs/artifacts; selective reruns missing an OS fail closed. Old artifacts remain retained; no silent fallback to the old receipt schema. Promotion continues to trust only the original canonical push/master producer, never the dispatch test run.

### D04 B: one trusted coordinator and durable lease

Add Toolkit release-coordinator.yml and a bounded coordinator helper. Wake it on successful canonical push/master CI and via workflow_dispatch from a CLI master-only completion job. CLI wake-up requires successful ordinary Linux/Windows jobs for the reported SHA; it must not depend on private coordinated evidence which the coordinator is meant to obtain. Payloads are hints: independently fetch canonical runs/jobs/master heads, validate source repositories, and reject PR/fork/untrusted artifacts. Ignore evidence-dispatch completion as an automatic new-release trigger to prevent loops. A CLI-triggered wake can use an already retained successful Toolkit master stage; it must not wait for unrelated Toolkit changes.

Activation guard `CLI_RELEASE_AUTOMATION_ENABLED` in Toolkit defaults to inactive when absent or not exactly `true`. Operator-approved implementation amendment (2026-09-13): the flag controls admission of a new release generation using the coordinator invocation configuration; it is not a live stop switch. Check it before acquiring a new lease/generation, including the first post-merge wake. A generation that already acquired ownership may finish its evidence, pointer registration and public release after the flag is disabled, including safe ownership reconciliation. Do not add a Variables-read token or pretend the running job observes live variable changes. Session A inspects existing value/timestamp and active/queued runs, verifies credentials and isolated lease contention, then explicitly activates the coordinator and requests one reconciliation. The initial PR/bootstrap steps remain Session A operations before activation. This enables the selected release automation; it never enables production course publication. Disabling blocks new generations under subsequent disabled invocations; inspect queued coordinator invocations that may retain older configuration, and separately cancel only unstarted coordination if needed. Never automatically cancel or conceal an in-flight npm publish; acquired operations and their children remain visible until reconciled.

Store a small append-only lease state on Toolkit `refs/heads/automation/cli-release-lease`, outside master. State schema: generation/owner coordinator run+attempt, selected pair, source-stage identity, child evidence/public-release run+attempt, state and timestamps. Use a commit parented to the observed lease commit and non-force fast-forward ref update (or create-if-absent); competing siblings cannot both advance the ref. No external database, R2 or KV. Validate real GitHub contention in an isolated temporary fixture ref before activation, then retire that fixture safely. No production course content is involved.

Only the lease owner may update candidate/evidence pointers or dispatch release children. Coordinator workflow concurrency is non-cancelling, but the persisted lease is authoritative across repositories/restarts. Hold ownership until all child operations are terminal. On timeout/cancel/API ambiguity, leave recoverable ownership; never steal just because a TTL elapsed. Reconciliation checks owner and all recorded children, adopts the same operation when safe, and advances generation only by conditional ref update. Duplicate/out-of-order wake-ups converge; release jobs verify current lease generation immediately before tag/npm mutations. Inspect existing vars, timestamps and all active/waiting runs before takeover; stop on unexplained newer candidates or nonterminal external writers. Session A manual operations obey the same lease after activation.

Persist a unique operation identity before every dispatch; correlate returned/discovered child runs by canonical workflow, SHA, attempt and unique operation token. Ambiguous dispatch delivery is a stop/reconciliation case, never an unconditional second publish. Recheck master pair before release and refuse stale checkout; don't retarget a running evidence job to newer master. Completion of an obsolete child is retained evidence, not permission to release the new pair. A later trigger reconciles the new pair. The lease holds through public release completion; partial npm success is held for D07 manual completion.

Use explicit scoped credentials: CLI `TOOLKIT_DISPATCH_TOKEN` permits Actions write on Toolkit; Toolkit `CLI_RELEASE_CONTROL_TOKEN` permits Actions write, Variables write and Contents read on CLI. Toolkit local GITHUB_TOKEN gets Contents write only in the trusted lease job and Actions write for dispatch. Runtime dispatch uses explicit CLI SHA and does not write Toolkit CLI_CANDIDATE_SHA; Session A owns that bootstrap/PR pointer under the lease. GITHUB_TOKEN is not assumed to grant Variables write. Public CLI retains its existing private-receipt read credential; private content never enters public artifacts. Version writer needs CLI Contents write/PR metadata read; verify actual RELEASE_TOKEN capability rather than trusting its name. No secret values in plan/logs. Credentials are activation prerequisites, not a request to paste secrets or broaden existing tokens silently.

CLI's trusted master release job also needs Toolkit Contents read for the exact lease ref/commit and bounded lease-state JSON. Provision that scope on TOOLKIT_DISPATCH_TOKEN; Actions read covers owner/child run checks. Its code allowlists only that ref, referenced state commit and regular bounded JSON, does not check out Toolkit, and sanitizes errors. Do not expose this credential to candidate PR execution. GitHub Contents permission is repository-wide even though the reader is path-restricted; this access is an explicit activation scope, not a claim that GitHub grants path-scoped tokens. Existing TOOLKIT_READ_TOKEN remains dedicated to the public receipt verifier. Operator-approved implementation amendment (2026-09-13): add Pull requests read on private Toolkit to TOOLKIT_READ_TOKEN, alongside Actions read, for exact live PR verification. This permission covers all private Toolkit PR metadata and diffs; code accepts only bounded canonical PR state/base/head/repository fields and emits no private text. Resolve the PR through the exact commit association API when workflow-run pull_requests is empty, then require a unique open same-repository master-target PR with matching head before and after receipt download. Toolkit master ref reads in release mode use the already approved TOOLKIT_DISPATCH_TOKEN only in trusted master jobs; candidate PR jobs never receive that Contents-capable credential. Do not weaken any exact-source/attempt or live-PR check.

The runtime path snapshots exact identity, starts fresh evidence, validates its completion, registers sanitized receipt pointers and dispatches CLI release with immutable inputs. No human copies version/run numbers in the normal post-merge path. Operator merges and content promotion remain outside this automation.

### D06/D07: directory publication and manual partial completion

Release CLI ci.yml dispatch runs all ordinary checks and strict private verification against the exact requested master SHA; builds all supported binaries from that SHA before publication completion. Validate committed calculated version, tag absence/match and registry state. Set tag to the proven SHA without a version commit. Use one clean checkout and frozen dependencies/build outputs for packing and directory publication, pinned npm 11.12.1, no lifecycle hooks between the two, no tracked mutation and no generated binary files accidentally added to the npm payload. Keep the credential config and the retained tarball outside the package file set.

Run npm pack, retain the candidate tarball and its SHA-512, smoke that pack, then npm publish the directory with scripts disabled. npm repacks: **these are not guaranteed to be the same bytes before publishing**. Independently download the actual registry package; require version, registry gitHead, source tag and SHA-512 to match expected. Do not require gitHead embedded in tarball package.json: D06 C relies on registry metadata. Record both expected and actual integrity and assert clean/frozen input inventory; mismatches stop completion and remain an incident because published npm versions are immutable.

Retain a bounded public manifest tying SHA/version, exact evidence/run/attempt, prepack integrity, binary hashes and original build artifact IDs to the run. If npm already contains this version, never invoke publish again—even if a previous job timed out. Verify whether it is identical and report complete, partial or conflicting. For a compatible partial release, the operator/Session A follows the runbook to verify the original successful artifact jobs and actual registry bytes, then uploads only missing GitHub assets without replacement. No rebuild, wildcard artifact merging or automatic recovery workflow. Missing/expired/mismatched evidence stops recovery; a broken published package needs an ordinary new repair PR/version, not overwrite/unpublish.

## Phase 1: Bind fresh private evidence to exact sources and attempts

### Changes Required:

**Files:** Toolkit .github/workflows/ci.yml; packages/api/scripts/tested-release-stage.mjs, public-coordinated-receipt.mjs, verify-coordinated-inputs.mjs; new packages/api/scripts/verify-retained-stage.mjs and tests under scripts/__tests__/. CLI scripts/verify-coordinated-receipt.mjs and .d.mts; tests/coordinated-receipt.test.ts.

**Intent:** Introduce release-only retained-stage dispatch and strict attempt-bound receipts while retaining the existing PR candidate path. Keep private artifacts inside Toolkit.

**Contract:** Revised strict schemas, exact artifact names/IDs, selected-attempt jobs, source-stage identity and separate transient-PR/permanent-master eligibility; every producer/consumer changes together. Old receipts cannot satisfy new release verification.

### Success Criteria:

#### Automated Verification:

- Toolkit targeted receipt/stage/input/workflow tests pass using `pnpm --filter @przeprogramowani/api exec vitest run scripts/__tests__/` with an explicit selected file list.
- CLI receipt regressions pass: `bun test tests/coordinated-receipt.test.ts`, including PR-head versus release-master eligibility, old SHA vs merge SHA, run/attempt relabeling, mixed jobs, missing Windows, stale download race, expired/duplicate artifacts and private canaries.
- Workflow regressions prove dispatch consumes retained bytes without transform/deploy/publish/notification, every consumer uses exact attempt artifacts, and every successful master stage is retainable without deleting predecessors.

## Phase 2: Publish the committed version from the proven CLI SHA

### Changes Required:

**Files:** CLI package.json (automatically prepared version only during implementation), scripts/auto-version.mjs, .github/workflows/ci.yml; new .github/workflows/prepare-version.yml, scripts/prepare-version.mjs, scripts/release-identity.mjs and tests/auto-version.test.ts, tests/release-identity.test.ts, tests/release-workflow.test.ts; existing tests/smoke/package.test.ts. Toolkit new .github/workflows/release-coordinator.yml, packages/api/scripts/release-coordinator.mjs, packages/api/scripts/lib/release-lease.mjs and corresponding scripts/__tests__/ tests.

**Intent:** Prepare version automatically on the ordinary CLI PR; remove release-time master writing; automate exact-pair evidence/release under the lease; publish the tested checkout directory and verify the actual registry result. Recovery remains a documented manual operation.

**Contract:** D01 C/D04 B/D05 comment/D06 C/D07 C as specified above; exact committed version and source remain common to npm/binaries/tag, while byte equality is verified after directory publish. Privileged writers run trusted code only; no candidate scripts receive write credentials.

### Success Criteria:

#### Automated Verification:

- CLI unit, type, lint, node/binary builds and package/binary smoke pass: isolated `bun test tests/*.test.ts`, `bun run typecheck`, `bun run lint`, `bun run build`, `bun run build:binary`, `bun test tests/smoke/`.
- Directory-pack/mock-registry regressions with pinned npm prove registry gitHead, exact tag/source/version, stable packing inputs and post-publish SHA-512 equality; deliberate mismatch leaves release incomplete and never republishes.
- Workflow regressions prove both ordinary OS checks and exact private evidence precede publishing, all checkouts use the tested SHA, and no release job writes a version commit to master.
- Coordinator regressions cover either-repository wake-up, duplicate/out-of-order events, lease contention, interrupted ownership, stale pair or pointers, dispatch identity ambiguity and zero second npm publishes.
- Version-preparation regressions prove automatic same-PR numbering from a pinned release baseline, repeat no-op, changed base/head invalidation, bot-triggered CI, fork rejection and no candidate execution with write credentials.

## Phase 3: Validate rollout instructions and prepare reviewed PRs

### Changes Required:

**Files:** Toolkit .github/workflows/promote-content.yml, packages/api/scripts/lib/publication-policy.mjs, packages/api/scripts/r2-sync.mjs and tests; Toolkit docs/how-to/release-10xdevs4-cli.md; CLI new docs/how-to/release-cli.md; both foundation lessons and contract registers; canonical repair artifacts.

**Intent:** Update promotion's artifact selection for exact producer attempt without admitting dispatch authority. Document automatic versioning, CLI-first bootstrap, lease ownership/reconciliation, credential scopes, manual partial completion, actual-package acceptance and content promotion/withdrawal. Run 10x-lesson and 10x-contract for recurring identity and binding interfaces, then 10x-impl-review for approved implementation.

**Contract:** Human merges; no production policy enablement. Preserve publisher CAS/storage, server auth/clock/KV, v3 cutoff da989a6f7d4963c275a98943e85d225baf426228, approved maintenance overrides and complete skills. Manual verification gates are not marked complete by automation.

### Success Criteria:

#### Automated Verification:

- Toolkit `pnpm ci:local` passes; promotion tests reject dispatch/non-master/wrong-source/attempt/mixed artifact selections and retain exact stage identity.
- `10x-impl-review` reports no unresolved critical implementation findings; scoped PR diffs contain no private content/credentials or unrelated files.
- Both repair PRs are created with source identities, test evidence and the concrete human merge sequence; `release-handoff.md` explicitly records unpublished status and Session C prerequisite state.
- Session A verifies the scoped automation credentials and a synthetic Git-ref contention trial before enabling the coordinator; unavailable credentials or failed atomic update verification stop activation.

#### Manual Verification:

- Operator merges the final automatically versioned CLI repair first against exact Toolkit PR evidence, then merges Toolkit after its PR evidence is refreshed for the actual CLI master SHA.

## Phase 4: Execute the authorized release sequence and stop at concrete gates

### Changes Required:

**Files:** release-handoff.md, operational evidence outside Git, publication and actual-package test records.

**Intent:** After operator merges and authorized activation, observe the automatic chain and independently verify npm download against production. Reinspect all production inputs at the eventual promotion gate rather than reuse the September 13 snapshot as current truth.

**Contract:** Coordinate before login email for marcin@przeprogramowani.pl; never request pasted tokens/passwords. Explicitly test upstream Phase 4: highest available authorized fresh course, stable v3 binding, zero writes from preview, no binding on failed preflight. Check complete EN/PL skill folders, login/refresh, sync/local edits and v4 identity after approved publication. Unavailable v4 is a publication gate, never a reason to weaken authorization. Module 1 remains gated by real server time/KV at 2026-09-14T06:00:00Z (08:00 Warsaw); no manufactured clocks/entitlements.

### Success Criteria:

#### Automated Verification:

- New private Linux/Windows evidence and public release succeed for the exact human-merged pair; record all source, run, attempt, original stage, tag, tarball integrity and binary identities.
- Actual downloaded npm package passes anonymous installation/help/version checks; following approved login, it verifies account status, highest available authorized fresh selection, stable v3 binding, no preview writes, no binding on failed preflight, EN/PL full skills, sync/refresh/local-edit preservation and exact v4 release identity when published.
- Readiness handoff records actual production pointer/lock/Worker/KV state, privately verified v3 backup, retained stage validation, exact promotion and withdrawal/rollback inputs, and remaining human/time gates without asserting unavailable v4 readiness.

#### Manual Verification:

- Operator approves the coordinated real-email login flow when needed.
- Operator separately approves content policy/environment configuration and the exact validated promotion; before first publication rollback is withdrawal from the newly active pointer, preserving all objects.
- After 2026-09-14T06:00:00Z, real production checks confirm module 1 unlock without overrides; until then only authentic locked behavior is claimed.

## Merge and execution order

1. Operator reviews this plan and explicitly authorizes implementation. No export or review verdict substitutes for approval.
2. Implement/test both isolated branches. Automatically calculate the CLI version and commit it to that repair PR. Session A alone coordinates the exact final PR pair; run Toolkit PR CI and CLI ordinary/receipt checks.
3. Operator merges CLI first. The resulting SHA has no valid post-merge evidence yet; no npm release is permitted. The new coordinator must expose pending/missing Toolkit prerequisite rather than use pre-squash proof.
4. Session A rechecks candidates/runs and refreshes Toolkit PR proof against actual CLI master. Operator merges Toolkit. Its canonical push/master retains a verified stage for the new Toolkit SHA. Configure scoped credentials and prove lease contention before activation; do not mutate production content.
5. Toolkit success or CLI wake causes coordinator reconciliation: acquire lease, pin actual master pair/stage, fresh release-only evidence, validate both OS/receipt, register exact pointer and dispatch CLI release. On an existing version, verify and stop or enter manual completion; never publish again.
6. Independently download npm package, record registry version/gitHead/integrity/source pair and perform anonymous then approved-login/v3 acceptance. Package failure does not become a production-ready claim.
7. Prepare separately approved content-production policy/environment and exact push/master promotion with rollback. Reinspect R2 pointer/lock, Worker revision, KV and fresh v3 backup. First-publication rollback is withdrawal against the newly active pointer, preserving objects/v3. A policy/source change requires its own valid source-stage/evidence; no transplanted provenance. Test v4 availability/identity and real locked/unlocked behavior after approval/time gate.

## Testing strategy and operational limits

New automation is verified with synthetic Git lifecycles, loopback npm registry and mocked GitHub state transitions, followed by a bounded real GitHub fixture-ref contention test only after implementation approval. Existing full CLI and Toolkit CI remain required. Include malicious PR file/script canaries, dispatch spoofing, two simultaneous writers, both merge orders, loss of dispatch response, stale master advancement, npm success with GitHub failure and safe restart. Do not duplicate product behavior tests; rerun the existing selection/binding/full-skill regressions and verify the actual released package.

D01 C retains the companion-PR prerequisite; it does not promise standalone CLI PR support. Version automation adds no extra human version approval but must stop on an invalidated/stale baseline. D04 B requires scoped credentials and durable state; its Git-ref atomicity is an activation test, not an assumed production result. Budget one complete retained-byte E2E matrix per post-merge pair, plus existing pre-merge proof; no repeated translation for evidence dispatch. Coordinator polling is bounded and records unresolved children on timeout; no additional SaaS/database. D06 C accepts post-publication mismatch risk; D07 C trades recovery code for verified manual work.

Progress revision: obsolete entries 2.1 (staged gitHead/automatic recovery), 2.3 (single-tarball publication) and 3.4 (Toolkit-first merge) are retired and their IDs are not reused. New criteria use 2.4–2.7 and 3.5–3.6. All retained step titles remain unchanged. That planning revision initially left all implementation boxes unchecked; current execution evidence is recorded only in Progress and implementation-run.md.

## References

- [Applied decisions](decisions.md), [original export](decisions-record.md), [decision details](decisions-details.md).
- [Research](research.md), [decision-alignment research](decision-alignment-research.md), [brief](plan-brief.md), [handoff](release-handoff.md).
- [Upstream access plan](../10xdevs4-cli-access/plan.md), especially Phases 4 and 7.
- Toolkit docs/how-to/release-10xdevs4-cli.md and publication-policy/release-publisher contracts.

## Progress

### Phase 1: Bind fresh private evidence to exact sources and attempts

#### Automated

- [x] 1.1 Toolkit targeted receipt/stage/input/workflow tests pass using `pnpm --filter @przeprogramowani/api exec vitest run scripts/__tests__/` with an explicit selected file list. — 8000d80
- [x] 1.2 CLI receipt regressions pass: `bun test tests/coordinated-receipt.test.ts`, including PR-head versus release-master eligibility, old SHA vs merge SHA, run/attempt relabeling, mixed jobs, missing Windows, stale download race, expired/duplicate artifacts and private canaries. — 8000d80
- [x] 1.3 Workflow regressions prove dispatch consumes retained bytes without transform/deploy/publish/notification, every consumer uses exact attempt artifacts, and every successful master stage is retainable without deleting predecessors. — 8000d80

### Phase 2: Publish the committed version from the proven CLI SHA

#### Automated

- [x] 2.2 CLI unit, type, lint, node/binary builds and package/binary smoke pass: isolated `bun test tests/*.test.ts`, `bun run typecheck`, `bun run lint`, `bun run build`, `bun run build:binary`, `bun test tests/smoke/`. — ca19fe2
- [x] 2.4 Directory-pack/mock-registry regressions with pinned npm prove registry gitHead, exact tag/source/version, stable packing inputs and post-publish SHA-512 equality; deliberate mismatch leaves release incomplete and never republishes. — ca19fe2
- [x] 2.5 Workflow regressions prove both ordinary OS checks and exact private evidence precede publishing, all checkouts use the tested SHA, and no release job writes a version commit to master. — ca19fe2
- [x] 2.6 Coordinator regressions cover either-repository wake-up, duplicate/out-of-order events, lease contention, interrupted ownership, stale pair or pointers, dispatch identity ambiguity and zero second npm publishes. — ca19fe2
- [x] 2.7 Version-preparation regressions prove automatic same-PR numbering from a pinned release baseline, repeat no-op, changed base/head invalidation, bot-triggered CI, fork rejection and no candidate execution with write credentials. — ca19fe2

### Phase 3: Validate rollout instructions and prepare reviewed PRs

#### Automated

- [x] 3.1 Toolkit `pnpm ci:local` passes; promotion tests reject dispatch/non-master/wrong-source/attempt/mixed artifact selections and retain exact stage identity. — a0bcd44
- [x] 3.2 `10x-impl-review` reports no unresolved critical implementation findings; scoped PR diffs contain no private content/credentials or unrelated files. — a0bcd44
- [x] 3.3 Both repair PRs are created with source identities, test evidence and the concrete human merge sequence; `release-handoff.md` explicitly records unpublished status and Session C prerequisite state. — a0bcd44
- [ ] 3.6 Session A verifies the scoped automation credentials and a synthetic Git-ref contention trial before enabling the coordinator; unavailable credentials or failed atomic update verification stop activation.

#### Manual

- [ ] 3.5 Operator merges the final automatically versioned CLI repair first against exact Toolkit PR evidence, then merges Toolkit after its PR evidence is refreshed for the actual CLI master SHA.

### Phase 4: Execute the authorized release sequence and stop at concrete gates

#### Automated

- [ ] 4.1 New private Linux/Windows evidence and public release succeed for the exact human-merged pair; record all source, run, attempt, original stage, tag, tarball integrity and binary identities.
- [ ] 4.2 Actual downloaded npm package passes anonymous installation/help/version checks; following approved login, it verifies account status, highest available authorized fresh selection, stable v3 binding, no preview writes, no binding on failed preflight, EN/PL full skills, sync/refresh/local-edit preservation and exact v4 release identity when published.
- [ ] 4.3 Readiness handoff records actual production pointer/lock/Worker/KV state, privately verified v3 backup, retained stage validation, exact promotion and withdrawal/rollback inputs, and remaining human/time gates without asserting unavailable v4 readiness.

#### Manual

- [ ] 4.4 Operator approves the coordinated real-email login flow when needed.
- [ ] 4.5 Operator separately approves content policy/environment configuration and the exact validated promotion; before first publication rollback is withdrawal from the newly active pointer, preserving all objects.
- [ ] 4.6 After 2026-09-14T06:00:00Z, real production checks confirm module 1 unlock without overrides; until then only authentic locked behavior is claimed.
