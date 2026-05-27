---
change_id: e2e
title: Cross-platform e2e tests for CLI user flows
status: archived
created: 2026-05-10
updated: 2026-05-27
archived_at: 2026-05-27T19:21:47Z
---

## Notes

do we have e2e tests that run cli from user perspective on both systems: unix (macos) and windows?

Key gaps identified:
1. No true e2e tests — nothing spawns the compiled binary with real argv and asserts on stdout/stderr/exit-code as a user would experience it. exit-codes.test.ts drives commands in-process via CAC's parse()+runMatchedCommand(), missing real subprocess behavior.
2. Windows smoke tests are missing — check-windows job only runs unit/integration tests, not build:binary + tests/smoke/. The compiled .exe is never tested before release.
3. No macOS CI at all for tests — macOS runners only appear in the build-binaries release matrix, never for test execution.

Proposed scope:
- Extend check-windows to include build:binary + bun test tests/smoke/
- Add a check-macos job mirroring check
- Add a small e2e suite that spawns the actual binary/dev-mode CLI as a child process and asserts on stdout, stderr, and exit codes for key user flows (auth, list, get, doctor)
