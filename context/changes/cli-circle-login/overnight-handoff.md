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
