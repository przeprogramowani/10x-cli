---
change_id: multi-tool-profiles
status: approved
created: 2026-07-27
updated: 2026-07-27
issue: https://github.com/przeprogramowani/10x-cli/issues/3
---

# Multiple active coding-tool profiles — implementation plan

## Overview

Extend the existing default-tool configuration with an ordered set of active
tool targets. Preserve every single-target contract while allowing `get` and
`sync` to materialize tool-specific content into several profile directories.

## Locked decisions

- `tool` remains the single default profile.
- `tools?: string[]` stores ordered active targets and always includes `tool`.
- Old configs are valid and normalize to `[tool]`.
- `--tool a,b,c` is the explicit non-interactive syntax.
- `--print` accepts exactly one target.
- The API is called per target because rules can be tool-specific.
- Active target manifests are peers and cannot be offered as migration orphans.
- Single-target JSON output remains unchanged; multi-target output adds
  `tools` and a result per target.

## Non-goals

- Remote API or ZIP schema changes.
- Cross-profile file deduplication.
- New authentication or course configuration.
- Automatic recovery from partial network failure.
- Renaming existing profile IDs or directories.

## Phase 1: Configuration and resolver

### Changes

- Extend `ToolConfig` with a validated `tools?: string[]`.
- Add pure parsing and normalization helpers.
- Add `resolveToolProfiles()` while retaining `resolveToolProfile()`.
- Support comma-separated `--tool` values.
- Make migration/orphan detection aware of all active targets.

### Automated verification

- [x] Old config resolves to `[tool]`.
- [x] New config de-duplicates targets and preserves default-first ordering.
- [x] Invalid IDs fail with the supported-ID list.
- [x] Existing single-profile resolver tests remain green.

### Manual verification

- [ ] A presenter can explain default vs active targets in one sentence.

## Phase 2: Multi-target `get`

### Changes

- Resolve an ordered profile list in `runGet`.
- Reject several profiles in `--print`.
- Fetch, filter and apply once per target.
- Preserve the existing JSON envelope for one target.
- Return an aggregate, tool-labelled result for several targets.
- Preserve language, course-rules, dry-run and conflict behavior.

### Automated verification

- [x] One command writes to `.claude`, `.agents` and `.cursor`.
- [x] Each request carries the matching `tool` API parameter.
- [x] Single-target get tests remain green.
- [x] A failing target produces an actionable tool-labelled error.

### Manual verification

- [ ] Final directory tree is readable at webinar font size.

## Phase 3: Multi-target `sync` and regression pass

### Changes

- Evaluate manifest and cheap-skip state per profile.
- Fetch/apply changed lessons per target.
- Label aggregate results by target.
- Preserve existing single-target output and exit-code rules.
- Add regression coverage for config, get, sync and orphan handling.

### Automated verification

- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun test` (475 tests; binary built first as required by smoke/E2E)
- [x] `bun run build`

### Manual verification

- [ ] Two complete demo runs stay within 32 minutes.
- [ ] Checkpoint switching is possible offline.

## Progress

- [x] Phase 1: Configuration and resolver
- [x] Phase 2: Multi-target `get`
- [x] Phase 3: Multi-target `sync` and regression pass
