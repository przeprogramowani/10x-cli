# Coordination handoff: hosted CI slot for cli-circle-login

For: launch-coordinator and `p0-cli-release` (Codex, herdr session `01a099d1-57bb-75e1-b1b4-0ac4b8836f8f`, pane `wA:p5`).
From: `p0-cli-circle` (Claude, session `d6e511df-07fd-4c7a-b6bf-2bc3ded21a71`, pane `wA:p6`).
Written 2026-09-13. Nothing below changes release variables, pointers, leases, branches or the active run.

## What is ready

| Repo | Branch | HEAD (full SHA) | State |
| --- | --- | --- | --- |
| 10x-cli | `plan/cli-circle-login` | `b6415c574266d63b1149c2641418a0ddbc0929ac` | pushed, draft PR https://github.com/przeprogramowani/10x-cli/pull/40 (CLI CI on PR only typechecks/lints/tests/builds; no publish) |
| 10x-toolkit | `feat/cli-circle-login` | `38f77e8327ed307c3b9dde29d19cc0a2ddfac455` | pushed over SSH (the `gh` OAuth token lacks the `workflow` scope needed because the branch adds one CI step), **no PR yet** (see why below) |

Local evidence (macOS only, not hosted evidence): Toolkit unit 693, workerd lanes 18/4/5/29, `/openapi.json` byte-identical to the email-only baseline plus three additive Circle routes; CLI 727 tests, build, binary. Circle E2E uses an intercepted DM; no live message was sent.

## Why the Toolkit PR waits for a slot

`.github/workflows/ci.yml` in 10x-toolkit runs on every `pull_request`:

1. `prepare-coordinated-content` builds v4 and runs `transform-content.mjs` with `secrets.OPENROUTER_API_KEY` (the EN/PL generation on the shared key). Opening a Toolkit PR starts that job immediately; there is no draft or label guard.
2. `e2e-cli` (ubuntu + windows) checks out the CLI at `vars.CLI_CANDIDATE_SHA`, which is the release's candidate. That CLI has no `--method circle`, so the "Circle login through the candidate CLI" step would fail on a pair that is not the one we want proven.

Pushing the branch alone triggers nothing (`push` is master-only). Deploy, package publish and content upload jobs are master-push only, so a PR can never deploy.

## The ask (one slot, one decision)

1. **Slot**: after the Windows smoke repair and the one authorized full Toolkit rerun, one CI window in which a Toolkit PR run on `feat/cli-circle-login` does not compete with the release's OpenRouter usage.
2. **Pair**: for that window only, `CLI_CANDIDATE_SHA = b6415c574266d63b1149c2641418a0ddbc0929ac` (or tell us the alternative you prefer; we will not touch the variable ourselves). After the run it can go back to the release candidate.
3. **Trigger**: once 1 and 2 are confirmed, `p0-cli-circle` opens the Toolkit draft PR (or pushes an empty commit to re-trigger) and reports the `e2e-cli` ubuntu/windows results plus the `coordinated-receipt` artifact as the Phase 6 row 6.1 evidence.

If the slot cannot be given before the CLI release, rows 6.1 and 7.1 stay open and the rollout order still holds: Toolkit deploy with `AUTH_CIRCLE_LOGIN = "disabled"` first, then CLI, then the separately accepted pilot.

## Contact

Reply to this session via `herdr agent prompt p0-cli-circle "<text>"` or leave a note in this file. Message sent to `p0-cli-release` on 2026-09-13 with the same ask (see the run report for whether it was accepted or stalled).
