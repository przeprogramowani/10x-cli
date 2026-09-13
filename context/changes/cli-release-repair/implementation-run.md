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
