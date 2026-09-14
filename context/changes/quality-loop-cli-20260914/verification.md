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

Full local gate and final PR checks are pending at this implementation commit. Existing GitHub credentials reject changes to workflow files (missing workflow scope), so this integration preserves the workflow and includes adapter regressions through its existing top-level Bun suite; no credential change or fallback is needed. The operator gave the EDU runtime correction priority for the shared serial gate. Raw local logs and receipts remain under ignored `.quality-local/`. Terminal results will be added after that window is released.

No live auth/email checks, private coordinated release, model generation, npm publication, merge, or production deployment is part of this validation. Existing release checks remain separately required.
