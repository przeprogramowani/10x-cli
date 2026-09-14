---
id: quality-loop-cli-20260914
title: Integrate the shared offline quality gate in CLI
status: in-progress
owner: night-quality-loop
---

The operator authorized integration of the existing quality-loop package through a green CLI PR, without merge, publication, formal reviews, or agent permission/configuration changes. Baseline: current origin/master a704a863, CLI 1.22.0. The September 8 pilot used CLI 1.10.0 and had never landed.

This change installs the dependency-free 1.0.0 managed runtime, a CLI adapter and explicit quality scripts. The local gate matches the preserved Linux CI steps: local TypeScript, Oxlint, current helper packaging validation, all top-level Bun tests, both builds and smoke tests. The existing CI unit suite exercises the four new adapter regressions. Windows and release workflows retain their native behavior. Public application source, authentication, package files and engines are unchanged. The typecheck script now names the installed compiler explicitly.

Runtime regressions use real Oxlint, TypeScript and Bun in isolated Git fixtures. The source package's existing 12 tests independently exercise timeout, cancellation, empty discovery, locks, stale receipts and controlled-copy updates. Canonical source is provided separately as a local Toolkit source diff, without triggering its paid generation pipeline. No client settings or privileged launcher are installed.

Validation and terminal PR evidence are recorded in verification.md. Raw local logs stay in ignored .quality-local.
