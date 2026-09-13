# Implementation evidence — Session A

Approved starting plan SHA-256: `f46f2c7789a2a1844af076198ceb3c9d2dae877a7a465cdd4ffce5ef4168fb59`. Operator invoked `10xWorkflow/10x-goal-implement` on 2026-09-13. Canonical execution state remains exclusively in plan.md Progress. This file records commands and observations, not a competing state tracker.

## Setup evidence

Fresh fetch retained CLI b0c789af70f30255fb05149ad86f8534f96c2cb6 and Toolkit39925ab6155c9c17fbdabd69d160b5f4fe928c4e. No unrelated code edits in either dedicated worktree. CLI roadmap absent; synchronization skipped. All required CLI/package scripts and tools exist. Toolkit companion dependency installation used pnpm10.33.0 frozen lockfile and completed successfully. Its existing optional internal-pkg postinstall could not find not-yet-built dist/install.mjs and tolerated it by its existing script; builds remain required. Test commands use Node22.14.0, Vitest3.2.4 and pinned Wrangler4.80.0.

## Phase 1 test-first reproduction

Before production changes, root ran in Toolkit companion:

```sh
env PATH=/Users/admin/.nvm/versions/node/v22.14.0/bin:$PATH pnpm --filter @przeprogramowani/api exec vitest run scripts/__tests__/public-coordinated-receipt.test.mjs
```

2026-09-13 12:28 Warsaw: **14 PASS, 1 FAIL**. New regression `cannot relabel retained platform evidence as a different run or attempt` failed with `expected [Function] to throw an error`: the current producer accepted the identical original OS receipts when runAttempt changed to2. This is the expected RED proof, not a failed repaired-code gate. Root then authorized the phase subagent to implement the strict identity changes. Gate-stack/green/break-check/commit evidence will follow only after actual execution.

Read-only GitHub attempt-job API for retained Toolkit34743867441/1 confirmed real run_id/run_attempt/head_sha fields, and retained-stage artifact metadata supplied workflow_run identity and archive digest. No candidate variables, workflow dispatches or production resources were changed during this inspection.

## Phase 1 completed gates

- Toolkit selected receipt/stage/input/workflow gates: 47 PASS, including 9 workflow checks. Initial run had two collection errors because course-content dist was absent; ordinary `pnpm --filter @przeprogramowani/course-content build` resolved the prerequisite (self-fix 1/2), then all passed.
- CLI coordinated receipt gate: 36 PASS. Actual historical GitHub ZIP parsed with the new bounded in-memory reader; schema1 proof was not accepted as a new release.
- Deliberate-break: root staged exact touched paths, replaced producer identity comparison with false in the worktree, observed 3 expected failures including attempt relabeling, and unconditionally restored from index. Restored file had no unstaged diff.
- CLI full isolated unit suite: 657 PASS/0 FAIL; typecheck PASS; lint PASS (0 errors, 3 existing warnings).
- Toolkit Node22 `CI=true pnpm ci:local`: PASS, including format/lint/build, API616 + course-content150 + internal61 + artifact16 + shared-reference25 tests, and all content/reference validators.
- Both staged diffs pass whitespace checks. Original export/applied-decision hashes unchanged. No remote variables, dispatches or production writes.

Minor adaptations: helper modules make snapshot/source/artifact guards executable in tests; ordinary push uses build eligibility with vetted master ancestors while release dispatch requires current master pair. Individual validated artifact-ID downloads flatten one archive only. Lease generation uses full Git SHA. Original-stage receipts use null source artifact ID, retained dispatch requires original exact ID. Promotion consumer migration remains Phase3; Phase2 must supply explicit release attempt/artifact/lease.

Private gate logs: phase1-cli-{unit,typecheck,lint}.log, phase1-toolkit-ci.log, phase1-break.log under the established private evidence directory.

## Phase 2 test-first reproduction and independent operational preparation

Root ran `bun test tests/release-workflow.test.ts` before Phase2 production edits: **0 PASS, 1 expected FAIL**, explicitly detecting `git push origin master` after the existing version commit. Agent then authorized to implement the approved full phase.

Read-only remote preflight at approximately 10:50 UTC: candidate variables retain their historical exact values; no noncompleted runs in the latest30 sample of each repo. CLI TOOLKIT_DISPATCH_TOKEN and Toolkit CLI_RELEASE_CONTROL_TOKEN absent; RELEASE_TOKEN exists but its scope remains unverified. Activation variable and canonical automation/cli-release-lease ref absent. No candidate/pointer mutation. Full active-state queries are still required immediately before real candidate operations.

At 2026-09-13T10:51:54Z root ran the approved isolated Git-ref contention trial in private Toolkit using the operator gh session. Probe ref `refs/heads/automation/cli-release-probe-c8749378110a`, parent `58ded3586cd829f19e9c32768096706088bcbd42`; duplicate creation rejected422. Concurrent sibling nonforce updates: `71ebe4c2d2b0f40ea462681d89c21886fcfaf167` rejected422 and `8cbfbac56c2b8249e39d3f3dd988c1393d55560e` succeeded200, with exact winner readback. Probe ref removed afterward;404 verified. No master, canonical lease or candidate pointer touched. This proves API contention behavior using operator access, **not runtime credential scope**, so criterion3.6 stays pending and automation stays inactive. Semantics also match [GitHub reference API documentation](https://docs.github.com/en/rest/git/refs?apiVersion=2022-11-28#update-a-reference). Private reproducible script/result: lease-api-probe.py and lease-api-probe.json.

## Newly discovered credential contract gap — operator decision pending

Phase1's live Toolkit PR validation uses GET pulls/{number}; Actions:read alone cannot access this private endpoint. GitHub documents Pull requests:read OR Contents:read for Get a pull request, while Git-ref read needs Contents:read. Actions run metadata describes the tested event and does not establish the current live PR head/state. The approved plan preserved the existing Actions-only TOOLKIT_READ_TOKEN while requiring strict live PR proof, so mock green gates did not close this deployment capability gap.

Root paused dependent credential/verifier wiring and presented an explicit operator decision in this session: smallest option adds Pull requests:read to the dedicated verifier token (repository-wide PR descriptions/diffs capability disclosed); alternative keeps Actions-only and requires separately reviewed private attestation design. Release master reads can use the already approved trusted-master-only TOOLKIT_DISPATCH_TOKEN Contents:read. No token was broadened, no livePR assertion removed, and no owner decision fields changed. Independent version/publication/lease implementation continues while awaiting the answer. No silence-based approval.

Primary source: https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request and https://docs.github.com/en/rest/git/refs#get-a-reference.

Phase1 commits: CLI `8000d80` (canonical closing commit), Toolkit `e043c15`. Progress uses the one-closing-SHA suffix required by progress-format.md; the companion SHA is recorded here.

### Operator resolved the credential gap

Operator explicitly selected: “Dodaj Pull requests: read — rekomendowane; zachowaj ścisłe sprawdzanie PR i dotychczasową architekturę.” Root aligned the plan's credential paragraph and resumed dependent Phase2 wiring. This adds only PR read to the dedicated Actions reader; Contents-capable DispatchToken remains trusted-master-only. Original exported/applied owner files remain byte-identical; the amendment is recorded here and in the plan, not by regenerating the Decision Record. Provisioning/permission verification is still pending.

Additional real API compatibility observation: successful private Toolkit PR31 run34742661325 has head_sha66927f6e4fcad4e8f4d18f331e64811938cc77fd and pull_requests:[], while commit association GET commits/{sha}/pulls identifies PR31 and its exact head/base (nowclosed). Artifact workflow_run.head_sha matches that candidate SHA. Verifier must resolve canonical PR association via the approved PR-read API and still reject closed/moved/forked PRs; an empty historical run array must not replace live validation.

Targeted independent plan-review of approved credential amendment: SOUND/no findings (recorded in reviews/plan-review.md). Fresh npm metadata still version1.20.0/gitHeadf89f19506cab8c9bbeb112242e4485fce4f1b77b/unchanged SHA512. Stable GitHub release v1.20.0 exists (not draft/prerelease, five platform assets); annotated tag0e29976b27a589ba47b4b38fba48f886994d88d8 dereferences to that exact gitHead. This validates numbering baseline metadata, not a new package release.

## Live activation guard capability gap — operator decision pending

Root/phaseagent found that coordinator runtime env vars are a startup snapshot; re-reading env does not observe an operator disabling the repository flag during the same run. GitHub GET repository variable requires Variables:read, absent from planned Toolkit Contents/Actions workflow permissions. Root presented explicit choice: add dedicated Toolkit RELEASE_ACTIVATION_READ_TOKEN with Variables:read only and retain live pre-dispatch/pointer-write checks (all repository variables scope disclosed, no Secrets permission), or explicitly redefine activation as new-lease admission only, allowing an acquired chain to finish publishing. No new permission or changed semantics implemented pending answer; independent Phase2 work continues. Source: https://docs.github.com/en/rest/actions/variables#get-a-repository-variable.

### Operator resolved activation semantics

Operator explicitly chose: “Bez nowego tokena — wyłączenie blokuje tylko nowe wydania, rozpoczęte mogą się zakończyć.” Plan amended accordingly: missing/false activation blocks acquisition of a new release generation; an already acquired generation may finish evidence/pointers/publication and safe adoption/reconciliation. No live-variable read, no new Variables-read credential, no claim that a running job sees changed configuration. Inspect queued coordination when disabling; do not silently cancel in-flight npm publication. Dependent Phase2 flag work resumed within this exact scope.

## Phase 2 target gates and entry-point correction

Initial targeted CLI run: 47 PASS / 1 real-Git fixture timeout (5s); unchanged assertions retained and explicit bounded 30s timeout added (self-fix1/2). Toolkit initial coordinator/workflow tests:20 PASS. Expanded target rerun: CLI49 PASS/1 FAIL, Toolkit37 PASS/1 FAIL. The new isolated no-dependency entry tests exposed silent no-op execution when a platform temporary path has a symlink alias and the module main guard compares unresolved argv with Node's resolved module URL. Production entry detection is being corrected; CLI target self-fix2/2, Toolkit target self-fix1/2. No failing gate is marked complete, staged or committed.

### Phase 2 repaired target and CLI gates

Final target rerun: CLI50 PASS/0 FAIL; Toolkit38 PASS/0 FAIL, including actual entry execution without dependencies. Root removed unused imports and an undefined GET-body option mechanically; no assertions or lint rules relaxed. Root staged exactly the phase touched-file set, removed the production registry gitHead comparison in the worktree, observed the real npm fixture fail on the wrong SHA, and restored unconditionally from index. Break-check PASS. Final isolated CLI gates after restore:671 unit PASS/0 FAIL; typecheck PASS; lint PASS (0errors/3existingwarnings); node build PASS; standalone binary build PASS; smoke10 PASS. Source package.version is automatically calculated1.21.0, still unpublished. Full Toolkit gate and independent phase review are in progress; no Phase2 commit yet.

### Full Toolkit gate and independent review

Toolkit Node22 `CI=true pnpm ci:local` PASS: API630/course150/internal61/artifact16/shared25 (882 tests), format/lint/build and all validators. Read-only current-master/active-state audit at2026-09-13T11:35:31Z: masters remain b0c789af /39925ab; all five nonterminal status queries in both repositories were complete and empty. This is a timestamped snapshot, not authority to mutate future pointers.

Independent 10x-impl-review (drift + safety reviewers) found one critical and four warnings not covered by the green suites. Saved reviews/impl-review-phase-2.md; verdict REJECTED pending corrections. Findings concern trusted-master adoption gating, new-pair wake convergence, content-based numbering, Actions-read credential routing and mutation404 handling. All repairs preserve the approved design; root delegated a single correction batch to the same phase agent. No additional external token or production change is required. No Phase2 commit is authorized by green tests while review remains rejected.

### Phase 2 final gates and review closure

Independent reviewers closed F1–F5; targeted review now APPROVED. Actionlint1.7.12 found illegal runner.temp at job-level env; moving identical paths to first-step GITHUB_ENV passed both repositories (self-fix1/2). CLI673unit PASS; one newly introduced fetch mock type mismatch was mechanically corrected by retaining Bun preconnect (typecheckself-fix1/2, unchanged assertions). Final CLI673unit +10smoke, types/lint/builds PASS. Toolkit targeted45 PASS; final Node22 ci:local PASS with API637/course150/internal61/artifact16/shared25 (889 tests), all validators,7existingwarnings. Additional staged deliberate-break removed invocation validation:2expectednoncanonical-adoption failures, then unconditional indexrestore. Root staged only touchedpaths; ownerdecisionhashes unchanged. Phase2 Automated2.2/2.4/2.5/2.6/2.7 verified; no Phase2 manual rows.

Minor adaptation: queued wake hints may reference exact canonical ancestor commits retained on current master; current selected source/evidence/release pair still uses exact master SHAs. Read-only release completion uses job GITHUB_TOKEN Actionsread; version-write token remains unchanged. Migration parked peroperator priorityupdate; no release dependency introduced.

Phase2 commits: CLI `ca19fe244f45fed72e68b228e0cd24d6d2715f11` (canonical closing SHA ca19fe2), Toolkit `150da9eee41f727915b14b39fd797dd5b3d539fb`. Toolkit precommit lint/format hooks PASS, no bypass. Phase2 has no Manual rows; Phase3/4 human gates remain unchanged.

## Phase 3 verification in progress

Implementation delegated to phase3_implementation; code writes stopped before gates. Reused retained-stage metadata/complete-membership checks for the promotion consumer; --green-build now carries exact source selection JSON, registered through10x-contract. Target promotion+retained tests73PASS; actionlint1.7.12 validates CI/coordinator/promotion syntax (external shellcheck/pyflakes unavailable/disabled). Two independent review tasks cover drift and safety; root owns gates and Progress. Full ci:local running. Production and internal-publisher observations refreshed in release-handoff.md; no content or shared pointer mutation. The exact operator/export owner fields remain unchanged.

Phase3 review corrections: successful print instruction now supplies --type skills; source promotion rechecks exact current-master ancestry before/after retained metadata/bytes with existing Contentsread. Updated target80PASS; two independent reviewers APPROVED. Deliberately removed ancestry calls in worktree only:6regressions failed as expected, then git checkout restored the exact staged file unconditionally. Final Toolkit ci:local running. CLI executable/test inputs are unchanged from Phase2's673unit+10smoke/type/lint/build gates; those results are reused for the docs-only CLI part. Snapshot12:12:36Z confirms masters/candidatevariables unchanged and all5nonterminalstatusqueries empty inbothrepos; requiredtwoautomationsecrets absent and no scoped credentials available in this process environment. No remote writes or publication.

Phase3 local gates complete: target80PASS; finalToolkit917tests/allvalidators/build/lint/formatPASS (7existingwarnings); workflowactionlintPASS; deliberatebreak6expectedFAIL/indexrestorePASS; twoindependentreviewsAPPROVED. Scopedprivacy/diffcheckPASS, DecisionRecord hashesunchanged. Progress3.1/3.2 completed. Committing the verified local subset now enables PRcreation;3.3remains pending until both PRs exist and3.6remains pending actualruntimecredentials. This is not full Phase3/productioncompletion. Humanmerge/login/contentgates unchanged.

Toolkit Phase3 verified local subset committed: `1d5c1990df949670c5673f7d8bf0fc9589665071`. Human merge and runtime capability gates pending.

COMMITp3 CLIa0bcd44a30df15f2b1dd5ec030fd89b9bc9b7b82 / Toolkit1d5c1990df949670c5673f7d8bf0fc9589665071. Bothfeaturebranches pushedvia existingSSH afterHTTPSworkflow-scope rejection. DraftPR39(CLI) andPR32(Toolkit) created. Progress3.3completed;3.6stillpendingcredentials. SessionA guardedCLI_CANDIDATE_SHAwrite12:21:04Z registeredexactCLIhead; privateCI34756860298/1started. Handoffholdsidentities/status. No masterpush/merge orproductionwrites. PostcommitProgress/handoffwritebackremainslocalwhilecandidatepairisfrozen.

Hosted gateWindowsnpm: FAIL(firstfixattempt1/2). Run34756812656/1 Linux+bootstrapPASS, WindowsstrictnpmversiontestFAIL. DelegatedtargetednpmInvocation platformresolutionresearch/fix+regression; no versionpin/identityweakening. OldToolkitprivatepair34756860298/1leftintactandactive; norelabelingorconcurrentpointerupdates. Phase3localreviewremainsitshistoricalverdict; finalhostedacceptancepending.

Windowsnpmfollow-up local gatesPASS:6target,674unit,10smoke,type/lint/build/binary;3existingwarnings. Deliberateprecedencebreakcaughtandindexrestored. BothindependentreviewsAPPROVED nofindings. Officialnpm.cmd primarysourceverified; no shell/versionpinrelaxation/newscope. Commitverifiedfixbeforehostedretry; keepoldToolkitrun/sourceunchangeduntilterminalbeforepublishingnewCLIheadandupdatingcandidatepointer.

ExternalToolkitgate34756860298/2FAIL: OpenRouterHTTP403weeklykeylimit, notaregressioncodefailure. StopdependentpaidCI; noquota/keyorPR-modecontractchangeauthorizedbythisfailure. IndependentCLIWindowsunitnpmfixPASS, smokehungonBun-copiedauto-versionfeatfixture; rootcancelledonlyownednonpublishingPRrun34757508517after7mstall toretrieveexactlogs. Separateboundedruntime-smokefixdelegated(firstself-fixofthisgate); noWindows skip/noassertionweakening.


Windows smoke follow-up: target4PASS; deliberately changed the production minor calculation to patch, observed the unchanged feature-version assertion fail, then unconditionally restored production from index. Initial full-suite run had one existing auth-status timeout (673PASS/1FAIL); unchanged retry passed674unit,10smoke,typecheck,lint,node/binarybuild (3existingwarnings). No assertion or skip relaxed. Independent drift and safety reviewers both APPROVED. Smoke now executes the actual production Node entry with fixture cwd and bounded subprocesses; internal cause of the earlier Bun stall remains an inference until hosted Windows confirmation.

Operator selected restoration of the existing OpenRouter allowance, preserving the approved CI design, and subsequently explicitly confirmed “limit przywrócony, możesz działać”. Session A is authorized for ONE full Toolkit CI retry for the final exact CLI/Toolkit pair. No budget amount, purchase, unlimited quota, key rotation, provider/model change or production action is authorized. Another quota failure stops paid retries. Runtime release credentials remain a separate prerequisite. Migration3→4 remains parked and is not a release dependency.
