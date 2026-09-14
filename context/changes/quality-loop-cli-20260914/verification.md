# Verification

Baseline: `a704a86311c318f9d649000a97521da1bf94503a`, fresh CLI origin/master, version 1.22.0. All work uses an isolated worktree. Primary CLI and both historical pilot checkouts are preserved.

## Reproduction and lightweight checks

- The baseline had no `.quality` runtime or scripts. Historical local pilot passes do not establish present coverage.
- First native baseline: typecheck, lint and helper validation passed; unit suite reported 791 passing / 1 failing. The failure was the release identity fixture requiring npm 11.12.1 while the local Node 22 installation had another npm. Builds/smoke were not reached in that run.
- Installed npm 11.12.1 with Node 22.14.0 in an ignored, worktree-local toolchain. No global package changes. The affected release identity/workflow/evidence tests then passed 48/48 with the existing assertions and timeouts.
- Added an explicit Bun 1.3.8 / npm 11.12.1 preflight so missing CI prerequisites are visible. Published CLI engines and dependencies remain unchanged.
- Four adapter regression tests passed: real debugger lint failure and restoration; real TypeScript assignment error and missing compiler; missing/empty Bun discovery, failing assertion and exact positive count; managed runtime drift rejected before execution.
- Fast passed on the new files; managed-copy comparison, actionlint and whitespace checks passed.
- Separate canonical source package: 12/12 fresh tests passed in its own Toolkit worktree. Imported runtime bytes are identical to its recorded source manifest. Source is not yet on Toolkit master and is not a permanent release pin.

## Complete gates

`node .quality/run.mjs gate` passed on clean implementation HEAD `396dbd92764810ac6ecde355e963b74f5e065442`: exit 0, 125.856 seconds. It ran under the shared serial gate after the prioritized EDU verification and pre-push finished.

| Check | Result |
| --- | --- |
| Toolchain | Node 22.14.0, Bun 1.3.8, npm 11.12.1 |
| Types / lint / helper validation | PASS |
| Unit + integration | 793 passed, 0 failed; includes the wrapper asserting four adapter regressions |
| Node build / standalone binary | PASS |
| Binary + package smoke | 31 passed, 0 failed |

Sanitized receipt: [local-gate.json](local-gate.json). Raw logs stay under ignored `.quality-local/`. CLI has no installed commit/pre-push hook; normal Git commit/push ran without bypass settings. The canonical Toolkit source passed its actual Husky lint/format hook and is retained as local commit `7864a61970cfa2da268c28f87e368e14927efc25`, with a separately delivered patch; no Toolkit push occurred.

The existing repository automation subsequently prepared version 1.22.1 in commit `33f862af21dfaf8105e23645329d0dfbb0f6c023`. That is a package metadata change, not a publication. Subsequent changes in this PR record evidence only. Existing workflow files remain byte-identical to baseline, and their top-level Bun suite exercises the runner's four regressions through `tests/quality-loop.test.ts`.

Hosted terminal checks belong to the exact current head of [PR #47](https://github.com/przeprogramowani/10x-cli/pull/47); do not substitute this earlier local receipt for current-head hosted results. The PR is made ready only after both native Linux and Windows CI finish successfully.

Risk mode was explicitly tested: exit 1 with unavailable private release evidence and no checks invoked. No live auth/email, private coordinated release, model generation, npm publication, merge, or production deployment is part of this validation. Existing release evidence remains separately required.
