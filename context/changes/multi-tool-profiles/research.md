---
change_id: multi-tool-profiles
status: complete
researched_at: 2026-07-27
source_issue: https://github.com/przeprogramowani/10x-cli/issues/3
tags: [cli, config, tool-profiles, backward-compatibility]
---

# Research: multiple active coding-tool profiles

## Question

How can `10x-cli` support several active coding tools without breaking the
existing default-tool contract, tool-specific API content, migration behavior,
`get`, `sync` or machine-readable output?

## Executive summary

The writer is already profile-parameterized; the single-profile constraint sits
one layer above it. `ToolConfig` requires one `tool`, `resolveToolProfile()`
returns one `ToolProfile`, and both `get` and `sync` fetch and apply content once.

The safest extension is additive:

1. retain `tool` as the default;
2. add `tools?: string[]` as the ordered active set;
3. normalize old configs to `[tool]` at read time;
4. introduce `resolveToolProfiles()` for multi-target commands;
5. keep `resolveToolProfile()` for consumers that need exactly one default;
6. fetch and apply the bundle per target because the API accepts `tool` and may
   return tool-specific rules;
7. exclude every active profile from orphan handling.

## Evidence from the code

### Configuration stores one required tool

- `src/lib/config.ts` defines `ToolConfig.tool: string`.
- `readToolConfig()` rejects payloads without a string `tool`.
- `updateToolConfig()` refuses to persist a config without `tool`.
- Existing tests assert preservation of `lang`, `acknowledgedOrphans` and
  `courseRules`, so the new field must participate in the same merge-safe path.

### Resolution is singular and mutates the default

- `src/lib/tool-prompt.ts` implements the priority chain flag → saved config →
  interactive prompt → Claude Code fallback.
- An explicit `--tool` currently persists that value as the new default.
- `handleToolSwitch()` receives one new profile and treats every other manifest
  as an orphan. That behavior is unsafe when several profiles are intentionally
  active.

### `get` performs one tool-specific fetch and one apply

- `src/commands/get.ts` resolves one profile before print/apply.
- `fetchLesson(..., { tool: profile.toolId })` proves the server response may
  depend on the target.
- `applyBundle(..., { profile })` is already reusable for another profile.
- JSON output exposes a singular `tool`, so multi-target output needs a
  `tools` collection while retaining the old shape for a single target.

### `sync` has the same single-target boundary

- `src/commands/sync.ts` resolves one profile and reads one manifest.
- Cheap-skip state lives in the target profile’s manifest, so skip/apply
  decisions must be made per target.
- The writer and manifest layers should not be redesigned; orchestration belongs
  in the command layer.

### Profile paths are already independent

- `src/lib/tool-profile.ts` maps Claude Code to `.claude`, Codex to `.agents`
  and Cursor to `.cursor`.
- `applyBundle()` receives a `ToolProfile`, so three applications naturally
  create three separate manifests and artifact trees.

## Decisions surfaced for planning

### 1. Default plus active targets

Recommended: keep `tool` as the default and add ordered `tools`.

Why:

- old config remains valid;
- commands needing one profile remain deterministic;
- a user can add or remove targets without silently changing the default;
- config migration is an in-memory normalization, not a destructive rewrite.

### 2. Explicit CLI syntax

Recommended: allow comma-separated IDs in `--tool`, for example:

```text
10x get m1l1 --tool claude-code,codex,cursor
```

A single ID preserves the old contract. Interactive TTY selection can use a
multi-select and persist its ordered result.

### 3. Fetch strategy

Recommended: fetch once per target and apply its own returned bundle. Do not
reuse a Claude-specific rules payload for Codex or Cursor.

### 4. Print mode

Recommended: require exactly one selected tool under `--print`; stdout cannot
represent several tool-specific artifacts without changing its established
streaming contract.

### 5. Orphan handling

Recommended: manifests belonging to active targets are peers, not orphans.
Interactive migration should only consider profiles absent from the active set.

## Risks

- Multi-target JSON output can accidentally break consumers expecting singular
  `tool`.
- A partial network failure may leave some targets updated and others stale.
- `sync` cheap-skip and aggregate reporting become more complex when every
  target has its own manifest state.
- Tool-specific rules files can collide for profiles sharing `AGENTS.md`
  (`codex` and `generic`); duplicate physical paths must be rejected or
  deliberately ordered.
- Existing migration tests assume every non-current manifest is orphaned.

## Verification targets

- old `{ "tool": "cursor" }` config resolves to one active target;
- new config preserves one default plus an ordered de-duplicated target list;
- invalid and duplicate IDs fail before auth or network work;
- one command applies to `.claude`, `.agents` and `.cursor`;
- active targets never trigger orphan migration against each other;
- single-target tests and JSON envelopes remain unchanged;
- typecheck, lint, targeted tests and full test suite pass.
