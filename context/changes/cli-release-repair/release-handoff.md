# Session A release handoff

**Status: operator approved the reviewed plan and invoked 10x-goal-implement on 2026-09-13. Phases1–2 implementation passed targeted, deliberate-break and full repository gates; independent phase review APPROVED. Phase3 promotion-consumer repair/runbooks pass80targeted tests,917full Toolkit tests/all validators, deliberate-break and independent APPROVED reviews. PR preparation and credential activation checks remain pending. No repaired package has been published by this session. Last production inspection showed unpublished v4. Session C stage-1 prerequisite is NOT satisfied; migration is parked and does not block this release.**

Canonical folder: `/Users/admin/code/10x-cli-release-repair/context/changes/cli-release-repair`. Read [plan brief](plan-brief.md), [plan](plan.md) and [research](research.md). This file is the release coordination handoff; other sessions must not change shared candidate variables/run pointers.

## Current authorization — implement through the human merge gate

The operator exported record SHA-256 `792e4b3ba300d81e5db00f5e12dbc899eb585d6ba27639fc4411ffc871d1ddc6`. Its actual bytes and applied decisions.md were read. Coordinator reports dry-run/apply saved 8, conflict 0, rejected 0 using `/Users/admin/code/10x-decision-room/.tmp/changes/cli-release-repair-344449df/config.json`. Do not regenerate the export, edit owner fields or apply it again. Export/review is not implementation authorization.

Choices: D01 C, D02 A, D03 A, D04 B, D05 A + automation comment, D06 C, D07 C, D08 A. Read [corrected plan](plan.md), [brief](plan-brief.md) and [alignment research](decision-alignment-research.md). Independent [plan review](reviews/plan-review.md): **SOUND**, all five dimensions PASS, no unresolved findings after two targeted corrections. Approved starting plan SHA-256 (before execution Progress and the separately approved implementation amendments): `f46f2c7789a2a1844af076198ceb3c9d2dae877a7a465cdd4ffce5ef4168fb59`. Operator subsequently instructed “Działaj zgodnie z 10xWorkflow/10x-goal-implement”, approving this exact plan. Session A is implementing the authorized scope; next human actions are the concrete CLI-first and Toolkit-second merges after tested PRs exist. No further numerical version approval is needed.

The corrected design automatically prepares the version in the same ordinary code PR; reverses initial merge order to CLI then Toolkit; automates post-merge evidence and publication with a durable lease; publishes a directory and verifies its actual npm integrity; retains manual recovery for partial publication. D01 C still requires a real Toolkit companion PR for pre-merge checks of future CLI-only work. Scoped credentials, bounded Toolkit lease reads and isolated lease contention verification are activation prerequisites described precisely in the plan. The coordinator starts inactive until Session A validates and activates it.

Operator approved the implementation-time credential amendment: add Pull requests:read to TOOLKIT_READ_TOKEN while retaining strict live PR checks. Contents-capable TOOLKIT_DISPATCH_TOKEN remains confined to trusted master release jobs. Plan is aligned and Phase2 wiring resumed; token provisioning and real scope verification remain pending. Original decision export/owner fields are unchanged. See implementation-run.md.

Operator resolved activation semantics without a new token: disabling prevents new release generations; an acquired generation may finish evidence, pointer registration and publication. The flag is not a live stop switch. Inspect queued coordinator invocations and active ownership when disabling; keep in-flight npm operations visible and reconcile them. Phase2 dependent work resumed.

Code changes, regression gates and PR preparation are now authorized. Human merges, coordinated login and separate production-promotion approval remain required; no PR is ready yet.

## Exact identities, observed 2026-09-13

| Item | Identity / result |
|---|---|
| CLI fresh master / repair base | `b0c789af70f30255fb05149ad86f8534f96c2cb6` (#38) |
| Toolkit fresh master / companion base | `39925ab6155c9c17fbdabd69d160b5f4fe928c4e` (#31) |
| Branches | `fix/cli-v4-release-evidence` in both isolated worktrees |
| Toolkit companion | `/private/tmp/10x-toolkit-release-repair` |
| Published npm latest | `@przeprogramowani/10x-cli@1.20.0` |
| Published gitHead | `f89f19506cab8c9bbeb112242e4485fce4f1b77b` |
| Published npm integrity | `sha512-fi38hdT9bOjZRMel7NTb11Kp/3T2tsKahMOYUW5zeUUgP8GpfXxksHihyyTvLms0ElWGob/6724PfEOCpBF2Og==` |
| Local candidate version | Automatically calculated `1.21.0` from pinned v1.20.0 baseline; local node/binary builds and package smoke pass. Phase2 gates and independent review passed; no new npm publication. |
| Failed release run | [CLI 34745146982](https://github.com/przeprogramowani/10x-cli/actions/runs/34745146982), attempt 1, ordinary Linux/Windows PASS, exact evidence FAIL, publishing skipped |
| Retained successful private run | [Toolkit 34743867441](https://github.com/przeprogramowani/10x-toolkit/actions/runs/34743867441), attempt 1, push/master, both OS/receipt/stage/deploy PASS |
| CLI actually proven by retained run | `c139ac5d89bc935be67174cc031e96f62661036d`, not the merged CLI |
| Public receipt artifact | ID `10313509151`, `coordinated-receipt`, unexpired at inspection |
| Retained stage artifact | ID `10313382854`, `v4-release`, 13 files, unexpired at inspection |
| Retained release ID | `r-88e2e5394c21e8a8509220a0f78700b046d7682e9bdafe5b15a7e10dc9514228` |
| Retained manifest SHA-256 | `d58337f2004fd3eba0f5ca268f57729c626aaf6063f64ed9dd94f20280379c30` |
| Stage source / validation | Toolkit `39925ab...`; manifest hash and all 12 listed object sizes/hashes verified by `readStage` |
| Current Worker version | `4a635328-e005-4d8b-91b6-a48000dd9c48`, 100% traffic |
| Current Worker deployment | `562dab9c-5a3c-4f37-95f1-f16becfa819d`, 2026-09-13T07:07:54.304Z; annotation ties it to Toolkit `39925ab` / run `34743867441` |
| Actual production v4 pointer / lock | Both absent on fresh remote GET at 2026-09-13T11:57Z. The earlier full prefix listing was empty at 08:22:05Z; that full listing was not repeated. |
| Module 1 KV override | `stateOverride:10xdevs4:1` remote GET returned 404 at 11:57Z; configured module-state namespace independently confirmed present. None written. |
| Module 1 schedule | `2026-09-14T06:00:00Z` = 08:00 Europe/Warsaw; server/KV gates preserved |
| Production publication policy | `productionEnabled:false`, `securedWorkerRevision:null` in freshly fetched Toolkit master at 12:00:23Z |
| Promotion environment | `content-production` GET 404; repository environment list empty |

At 11:39Z, Toolkit CLI_CANDIDATE_SHA remained `c139ac5d89bc935be67174cc031e96f62661036d` (updated06:23:51Z), CLI TOOLKIT_CANDIDATE_SHA remained `39925ab6155c9c17fbdabd69d160b5f4fe928c4e` (updated06:54:55Z), and TOOLKIT_COORDINATED_RUN_ID remained `34743867441` (updated07:08:50Z). Attempt/artifact pointers and activation flag were absent. All five nonterminal-status queries (queued, in_progress, waiting, requested, pending) were empty in both repositories at11:35Z. No shared candidate/evidence pointer was changed by Session A. Reinspect immediately before each operation; this snapshot is not a lock.

Scoped activation prerequisites remain incomplete: CLI TOOLKIT_DISPATCH_TOKEN and Toolkit CLI_RELEASE_CONTROL_TOKEN secret names were absent at11:39Z. CLI TOOLKIT_READ_TOKEN and RELEASE_TOKEN exist, but names do not prove granted scopes. A real isolated Git-ref contention probe using the operator credential passed (duplicate create422, sibling updates200/422, winner readback); only its own fixture ref was retired. Runtime-token capability verification is still required before activation. Do not copy the operator's broad credential into automation or request pasted tokens.

## Evidence already completed

- Reproduced exact current receipt accepting pre-squash CLI and rejecting actual merged CLI.
- Reproduced identical synthetic OS receipts being reissued under attempt 1 and 2 by the existing producer. The regression was reproduced RED; Phase1 repair passed targeted/full gates and was committed as CLI8000d80 / Toolkite043c15. The retained historical receipt remains invalid for the merged CLI.
- 86 focused receipt/selection/binding/safety tests PASS.
- Full current CLI unit/integration baseline: **647 PASS, 0 FAIL**, 35 files, with isolated XDG config. Initial sandbox run failed on localhost/auth-lock restrictions; successful rerun used the same source outside those restrictions.
- CLI typecheck PASS; lint 0 errors / 3 existing warnings. Node and standalone binary builds PASS; these are local unpublished builds reporting source version 1.20.0.
- Smoke verified: initial 9 PASS / 1 npm-pack environment failure, then all 4 package smoke tests PASS with private npm cache/outside sandbox. Combined binary/course/package smoke coverage passes; this is baseline, not new-release evidence.
- Planning revision: synthetic directory publication using real npm 11.12.1 against a loopback mock registry passed (same bytes/SHA-512, registry gitHead equal fixture commit, clean tracked source). This is feasibility evidence, not the actual CLI npm release. Details in decision-alignment-research.md.
- Direct R2 inspection, retained GitHub-stage validation and deployed Worker metadata checked using pinned Wrangler 4.80.0 and existing storage client. No R2 mutations.
- New private v3 backup: **57 objects, 35,776,634 bytes**, inventory SHA-256 `f56176d8be1765862442868fd32309f73fc3e229d4fa25e0baf3db631745cd5f`. All local bytes verified; second remote full compare reports unchanged. Client printed reconnect diagnostics but both commands completed and independent hashes matched.
- Current v3 differs from historical E2E fixture: same 57 keys, 33 changed object hashes. Preserve the actual current baseline; do not restore or republish the old fixture. This difference pre-exists this session; its origin was not established here.

Private raw artifacts, backups and test logs: `/private/tmp/10x-release-repair-evidence-20260913/`. They are outside both repositories. No credentials or paid content belong in public PRs/logs.

## Selected design and execution order after authorization

All eight exported choices, including the D05 comment, supersede the earlier plan's recommendations. No repair PRs exist yet; implementation has started under the approved plan. Minimum version automation is deterministic preparation on the same code PR, reusing the existing bump rules; it adds no separate version PR or approval. Literal zero additional logic cannot repair the current post-evidence writer, but no new numbering service is proposed.

After plan approval: implement/test the two repair PRs; automatically prepare final CLI version and prove exact Tpr/Cpr through the Toolkit PR path; operator merges CLI first; refresh Toolkit PR evidence against actual CLI master Cm; operator merges Toolkit; canonical Tm push/master retains its stage. Provision the scoped coordinator credentials and validate lease contention at activation. The coordinator reacts to either repository, serializes the operation, produces release-only Tm/Cm evidence, registers its receipt and starts public CLI release for Cm. Actual npm download must prove registry gitHead/version/tag and post-publication integrity. No old fixed-name successful run is rerun or discarded as a shortcut.

Directory publication can diverge from the earlier pack; D06 C accepts detection after the immutable publish. A mismatch is an incomplete release. D07 C blocks a second npm publish and uses the original verified artifacts plus manual completion of missing GitHub assets. A real login approval and production content-promotion approval remain separate gates.

## Content promotion and rollback preparation

This is a separate gate; no policy/environment/pointer change is authorized by the repair-plan choices. The observed current identity is exact JSON `null`. Existing retained release/hash above is validated storage input, but its CLI evidence is pre-squash and must not be represented as the final repair pair.

Before presenting the final promotion for approval:

1. Finish new receipt/stage workflow repair and human merges. Select a successful canonical **push/master** source run, its explicit attempt and exact retained artifact ID; revalidate all stage bytes, schedule, curriculum/full skills and source ancestry. A dispatch run cannot substitute as content producer.
2. Verify secured Worker source/traffic and access guards; present a narrowly scoped policy PR setting productionEnabled and the exact secured source floor. Prepare `content-production` master restriction, required human reviewer and least-privileged credential setup without printing/requiring pasted secret values. Operator approves the concrete production-enablement configuration and performs its merge.
3. Reinspect active writers, production pointer/lock, KV state and v3 baseline. Stop on an unexplained newer pointer/candidate or nonterminal lock holder. Refresh stage/evidence if the selected Toolkit SHA changes.
4. Submit exact promote inputs: canonical source run/attempt, full Toolkit SHA, immutable stage artifact ID, selected release ID, manifest hash, `expected_current` equal to the observed pointer (`null` only while still absent). Canonical `promote-content.yml` uploads/verifies immutable objects then CAS-switches current. No direct R2 PUT, clock change or entitlement workaround.
5. First-publication rollback is **withdraw**, with expected_current equal to the newly active pointer. It creates a tombstone, preserves all objects and v3, and blocks historical v4 reads. Rollback to a different release is possible only after verifying an actual retained previous release. Do not roll back to the old unguarded Worker or delete the pointer/lock blindly.
6. Verify production manifest/hash, complete EN/PL object inventory and unchanged v3 inventory; then verify the actual downloaded CLI against production. Before 06:00 UTC on 14 September, locked module behavior is expected; unlocked acceptance remains pending until real server time reaches the boundary.

The exact final promotion command cannot yet be issued honestly: the repair/policy commits, final producer attempt, environment and fresh paired evidence do not exist. This handoff records the current validated inputs and the exact remaining prerequisites rather than claiming promotion readiness.

## Actual downloaded-package acceptance still required

After publishing the new version, independently fetch registry metadata and tarball into a new isolated install; verify SHA-512 and gitHead against release evidence, record package version, tag SHA and source pair. Do not reuse local dist or the historical candidate tarball.

Coordinate a real login link for `marcin@przeprogramowani.pl` before sending it; operator approves in browser, no pasted tokens/passwords. Verify auth/refresh, default highest available authorized selection, explicit course list/get, stable v3 projects (including released-1.20.0 legacy manifests), and no fallback from bound unavailable courses. Snapshot project/preferences before list/print/dry-run and failed preflight; verify zero changes/no new binding. Verify EN/PL, complete skill support trees, sync, missing-file repair and local-edit preservation. When v4 is published, match returned/installed release ID and manifest hash exactly. Keep locked/unlocked checks tied to actual server time/KV state.

Historical real-email results in `/Users/admin/code/10x-cli-v4-delivery/context/changes/10xdevs4-cli-access/package-manual-results-2026-09-13.md` remain useful regressions, not a substitute for the actual new npm package.

**One-line handoff:** Session A release authority and remaining gates: `/Users/admin/code/10x-cli-release-repair/context/changes/cli-release-repair/release-handoff.md`; Session C stage 1 is not satisfied.

## Operator priority update — migration parked

2026-09-13: Operator parked migration of existing projects3→4 until reconsideration on14–15September (D15-C). Migration is no longer P0 or a prerequisite for releasing access and working new10xdevs-4 projects. Session A continues its already authorized release scope without waiting for migration implementation; v3 compatibility and existing security checks remain mandatory. This update does not change exported Decision Record owner fields or authorize merges, publication, deployment or production content promotion beyond earlier grants.

## Implementation and production refresh — Phase 3

- Phase1 commits: CLI `8000d800715ae0f55920d54151399e6a658671eb`; Toolkit `e043c154174ff85c5870b57f1b746b25a9b3e964`.
- Phase2 commits: CLI `ca19fe244f45fed72e68b228e0cd24d6d2715f11`; Toolkit `150da9eee41f727915b14b39fd797dd5b3d539fb`. CLI673 unit tests +10smoke pass, types/lint/builds pass; Toolkit889tests and all ci:local validators pass. Both deliberate-break checks went red and were restored. Independent Phase2 review APPROVED, findings closed.
- Fresh retained-stage validation: manifest and all12objects passed again; provenance remains Toolkit39925ab. Source run34743867441 is still successful push/master attempt1; artifact10313382854 is unexpired, size1582545, expires2026-12-12T06:53:33Z, archive digest `sha256:b4bcfa7b60b89dcb008f45ad68483da1abcae55ca694845f492e6ed859d7daa6`. Its old fixed-name/schema proof remains historical and cannot satisfy the repaired release/promotion verifier.
- Fresh Worker deployment query at11:57Z confirms the same deployment/version listed above (selected by latest created_on, not response-array order). No production write or clock/entitlement change was performed.
- All57local v3 backup objects were rehashed and size-checked again:35,776,634bytes and the same inventory SHA-256. The earlier08:22Z remote full comparison remains the last remote inventory comparison; repeat it before eventual promotion.
- Existing Toolkit internal-package publisher audit: fresh master `39925ab6155c9c17fbdabd69d160b5f4fe928c4e`, package2.44.1, baseline tagv2.44.1 resolves `f4be3c5ed59f291f5d42c0b991dd43a8b4321fa5`. Diff from that tag through the repair HEAD under internal-pkg/ai-artifacts, excluding READMEs, has zero changed paths. This repair therefore does not trigger its additional version commit. Repeat before merge if source advances. Future internal-package changes can advance Toolkit master after source CI and leave the coordinator pending a new exact source stage; do not accept equivalent trees or repurpose old provenance. No unrelated publisher redesign is included.
- Process applicability: 10x-deployment's PaaS foundation/config generation is skipped because this repair does not propose a new platform/Worker deployment; existing read-only Wrangler production preflight and Toolkit Worker build checks supply the relevant evidence. Browser 10x-e2e is not applicable to CLI workflow changes; real CLI/API hosted matrices and actual npm acceptance remain required. No archive until actual completion.

Toolkit reviewed repair head after Phase3: `1d5c1990df949670c5673f7d8bf0fc9589665071`. CLI Phase3 closing SHA is written after its commit; see the final operational section for the frozen pair.
