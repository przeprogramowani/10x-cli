# Overnight handoff — cli-circle-login (13→14 September 2026)

Session `p0-cli-circle` (Claude, `d6e511df-07fd-4c7a-b6bf-2bc3ded21a71`, pane `wA:p6`). Operator directive for the night (verbatim intent): go with the recommended option, implement, test, review, bring PRs to ready-for-merge or merge when there is no doubt, log every decision and mutation with evidence for the morning review. P0 (`p0-cli-release`) owns every mutation of the shared CLI/Toolkit release path; Circle prepares local integration and merges only after P0's core release frees the window, in the order backend (flag disabled) → CLI.

Log is append-only, newest at the bottom. Times are local (Europe/Warsaw).

## Standing constraints for this night

- No Toolkit PR open, no Toolkit push trigger, no candidate/pointer change while P0's window is active (Toolkit PR32 `7fecf32`, run `34776455388/2`).
- Merge only with the current PR title, fresh pair and fresh evidence; never reuse an old approval gate or old SHA. Order: Toolkit `AUTH_CIRCLE_LOGIN = "disabled"` first, then CLI.
- Pilot, real Circle DM, flag activation, secrets, support staffing: morning, operator-owned. Manual plan rows stay unchecked. No fabricated tests.
- Nothing here reruns paid Toolkit CI without a window agreed with P0.

## Decisions and actions

### D-N1 · Rebase the CLI branch onto master `b2150bae` (decided before acting)

- State read: CLI `origin/master` = `b2150bae8540a01ed9a395abedfaa616d0c67f32`, one squash commit ahead of my base `b0c789af` (release scripts, docs, lessons, tests). Zero file overlap with `plan/cli-circle-login` (`comm` of both diff file lists is empty). Toolkit `origin/master` still `39925ab6`; PR32 unmerged, so no Toolkit rebase is possible yet.
- Decision: `git rebase origin/master` (recommended: linear history, exact-pair verifier needs the CLI candidate to be a master descendant). Conflicts, if any, are resolved on substance and logged here.
- Gates after rebase: typecheck, lint, full `bun test` (includes master's new release tests), build, binary, `generate-types --check` against the Phase 4 candidate spec, then Toolkit workerd lanes against the rebuilt binary.
- Previous "frozen pair" `1e42a253` / `38f77e83` is superseded by this directive; the new CLI head is reported to P0 after the gates.

- Result (21:40): rebase clean, 16 commits replayed, new CLI head `f78416135a24793943e92026ac4e83c360379fb9`. Gates on that head: typecheck PASS, lint PASS (3 pre-existing warnings), build PASS, binary PASS, `generate-types --check` against the Phase 4 candidate spec PASS, `bun test` 753 pass / 1 fail (see D-N2). Toolkit workerd lanes against the rebuilt binary: DO 18, routes 4, Circle CLI 5, released-CLI compatibility 29, `/openapi.json` byte-identical to the candidate. Pushed with `--force-with-lease` (old remote `1e42a253`) → PR #40 head `f784161`.

### D-N2 · Master's pinned-npm publication test needs npm 11.12.1 locally

- Failure: `tests/release-identity.test.ts` "pinned real npm directory publish retains gitHead and the exact prepack bytes" throws `Pinned npm 11.12.1 required` (`scripts/release-identity.mjs:45`); local npm is 10.9.2. Master-owned test, unrelated to Circle code.
- Decision (coordinator recommendation): provide npm 11.12.1 in a task-local prefix only (`<scratchpad>/npm-11.12.1`, `npm install --prefix`), put it first on `PATH` for that gate; no global npm/config change, no assertion or limit change.
- Result: with that PATH the file passes 6/6 (real npm publish against the test's local registry fixture). Environment issue closed by an actual PASS, not by skipping. Hosted CI pins the version itself.

### D-N3 · Toolkit branch rebased onto master `8bba7fd` locally, not pushed

- State read: Toolkit PR32 merged as `8bba7fd9381b7ccbb7a776453b3d69a2449c0cbe`; master CI `34778503330/1` owns the window (P0). Overlap with `feat/cli-circle-login`: only `.github/workflows/ci.yml`.
- Decision: rebase locally now (recommended, keeps the pair a master descendant); do not push, open a PR or dispatch until P0 frees the window. The branch still adds exactly one CI step (`pnpm test:e2e:circle`) inside the existing `e2e-cli` matrix job; no candidate variables, pointers or release jobs touched (`git diff origin/master..HEAD -- .github/workflows/ci.yml` shows only that step).
- Result: rebase clean (6 commits), new local Toolkit head `757d4788b20fd227ad3d01b7ceb2ac83566128bc`. `pnpm install --frozen-lockfile`, course-content build, API unit lane 770 pass, wrangler dry-run lists both Durable Objects.
- Result (22:05): workerd lanes on Toolkit `757d478` against the CLI binary built from `f784161`: DO 18, routes 4, Circle CLI 5, released-CLI compatibility 29, all PASS; `/openapi.json` byte-identical to the Phase 4 candidate. Logs: `<scratchpad>/night2-*.log`. macOS-local only, not hosted evidence.
- PR #40 on `f784161`: hosted `check` PASS, `check-windows` PASS, `Prepare version (#40)` PASS (run `34778673604`); release jobs skipped on PR as designed. The private-evidence job stays red until a Toolkit private run exists for the exact pair, which needs the window.

### D-N4 · Publish this log and the refreshed heads (CLI branch only)

- Decision: commit `overnight-handoff.md` and the head refresh of `coordination-handoff.md` on `plan/cli-circle-login` and push with lease. This moves the CLI head once more (docs-only commit, no code change); the Toolkit branch is not pushed. P0 and launch-coordinator get the new CLI head plus local Toolkit head via herdr, with the ask for the window after core.
- Result (22:20): commit `56b87f6018706eaba449e1cd95c06402b29609eb` pushed with lease (`f784161..56b87f6`); PR #40 `check`/`check-windows` re-running on it.

### D-N5 · Toolkit path blocked for the night by the OpenRouter budget gate; PR41 goes first

- State read (P0, 22:10): Toolkit master run `34778503330/1` FAILED, `prepare-coordinated-content` `103781105858` HTTP 402 (weekly limit 55 USD exhausted, remaining 0); both OS, receipt, stage, deploy SKIPPED, no master artifact. Two scoped runtime credentials for npm publication are also missing (`TOOLKIT_DISPATCH_TOKEN` in CLI, `CLI_RELEASE_CONTROL_TOKEN` in Toolkit). P0: no Toolkit model run or companion trigger will be allocated tonight; morning unlocks are being collected by root/P0. Ordinary CLI PR CI (#40, #41) is allowed.
- Consequence: every Toolkit `pull_request` run starts the same paid job, so the Circle Toolkit PR cannot be opened tonight without hitting the same 402. Without a Toolkit private run for the exact pair, PR #40's "Verified private CLI/API evidence" job stays red and the merge order (Toolkit with `AUTH_CIRCLE_LOGIN = "disabled"` → CLI) cannot start. Decision: no Toolkit push/PR, no CLI merge, PR #40 stays a draft at maximal readiness; nothing else is retried against the exhausted key.
- PR #41 (`feat/cli-skills-guided-use`, head `4415564c1bd446de14499b91cb6c0f4719db4ede`, full CLI master `b2150bae`) is independent of Circle and does not need the Toolkit run, so it should not queue behind Circle. `git merge-tree` of PR41 × PR40 shows content conflicts in `README.md` and `skills/10x-cli-guide/SKILL.md` (docs only; Circle touches 3 and 14 lines there). Decision: PR41 merges first whenever its own evidence is complete; Circle rebases `plan/cli-circle-login` onto the resulting master and resolves those two files on substance (Circle login paragraph added next to the guided-use text). That rebase is Circle-owned work, logged here when done.
- Morning unlock list for Circle (nothing in it is doable tonight): (1) budget headroom or a non-generation Toolkit path for one `pull_request` run of `feat/cli-circle-login` after it is pushed at `757d478` or its rebase; (2) `CLI_CANDIDATE_SHA` set by P0 to the then-current PR #40 head for that run; (3) both-OS `e2e-cli` receipt → PR #40 private-evidence job green → ready-for-merge in the Toolkit → CLI order; (4) operator-owned rows: DM pilot, flag, `CIRCLE_MESSAGING_TOKEN`, support.

### D-N5a · Correction (22:50, after the operator's objection): no PR41-first; Circle before helpers

- The "PR41 merges first" line in D-N5 is withdrawn. Checked facts: PR41 (`4415564c`) is a draft whose "Verified private CLI/API evidence" job is red exactly like PR #40's; ordinary green does not make it merge-ready. There is no technical dependency in either direction: the only overlap is two doc files (`README.md`, `skills/10x-cli-guide/SKILL.md`), resolvable by whichever branch rebases second. Operator priority stands: core (P0) → Circle (P0) → helpers. Recommended order: Circle closes without waiting for helpers; PR41 rebases onto the Circle-merged master afterwards.
- Verified proof mechanics (read from `scripts/verify-coordinated-receipt.mjs`, Toolkit `snapshot-coordinated-inputs.mjs` and `ci.yml`, and the release handoff of `cli-release-repair`): a CLI PR's evidence job runs the verifier in `pr` mode and needs `vars.TOOLKIT_COORDINATED_RUN_ID` + `vars.TOOLKIT_CANDIDATE_SHA` to name a successful Toolkit `pull_request` run whose receipt has `toolkitSha` = the head of a live open canonical Toolkit PR and `cliSha` = this CLI PR's head. The Toolkit run takes `cliSha` from `vars.CLI_CANDIDATE_SHA`, which must be CLI master (or an ancestor) or the head of an open canonical CLI PR. Every Toolkit PR run also runs the paid generation job, so each proof costs one budgeted run.
- Real DAG for Circle (no fiction of readiness; nothing below exists yet):
  1. Prerequisite: OpenRouter budget headroom for two Toolkit PR runs (P0/root morning unlock). Not needed for PR-mode proof: `TOOLKIT_DISPATCH_TOKEN` / `CLI_RELEASE_CONTROL_TOKEN` (those gate the `workflow_dispatch` release/publication path only).
  2. Circle pushes Toolkit `feat/cli-circle-login` at `757d478` (or its rebase onto the then-current master) and opens the draft Toolkit PR in the window P0 names. P0 sets `CLI_CANDIDATE_SHA` = PR #40 head (currently `0e1998d0…`, see below) beforehand. Run 1 → receipt (Toolkit `757d478`, CLI PR40 head), both OS.
  3. P0 sets `TOOLKIT_COORDINATED_RUN_ID` / `TOOLKIT_CANDIDATE_SHA` to run 1; PR #40 evidence job green; both reviews fresh; PR #40 leaves draft; operator (or, under the night grant, this session with full evidence) squash-merges PR #40 with its current title → CLI master `M1`.
  4. P0 sets `CLI_CANDIDATE_SHA = M1`; Toolkit PR run 2 proves (Toolkit head, `M1`); Toolkit PR merged → master push deploys the API with `AUTH_CIRCLE_LOGIN = "disabled"` and applies the DO migration.
  5. Only then the CLI release dispatch (release mode; needs the two scoped credentials) publishes npm. "Backend disabled → CLI" therefore means rollout: Toolkit deployed before CLI publication. It does not reverse the runbook's strict premerge order, which is CLI PR proof first, then post-squash Toolkit proof, then Toolkit merge; both statements hold at once.
  6. Pilot: separate operator acceptance (Manual rows 1.1/1.2, flag `pilot`, `CIRCLE_MESSAGING_TOKEN`, support).
- PR41 after Circle: rebase onto `M1`-or-later master, resolve the two doc files, then its own pair proof through whatever Toolkit PR run P0 allocates next (a Toolkit PR is the only PR-mode vehicle; no empty companion PR is created for it). PR41's session was told to hold and to confirm it does not need to precede Circle.
- No mutation tonight beyond this log: no Toolkit push, no PR, no pointer or variable change.
