# Disable Course Rules Implementation Plan

## Overview

Add an opt-out for the **course rules block** — the sentinel-marked section
(`<!-- BEGIN/END @przeprogramowani/10x-cli -->`) that `10x get` injects into the
active tool's rules file (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/10x-course.mdc`,
etc.). Users who prefer their own rules, or who use the CLI outside the course,
can disable it per-invocation with `--no-course-rules` and persistently via a
`courseRules` setting in `config.json`. When disabled, a previously-applied block
is stripped from the rules file. Skills, prompts, and config-templates are
unaffected.

## Current State Analysis

- A lesson bundle has four buckets — `skills`, `prompts`, `rules`, `configs`
  (`src/lib/api-content.ts:83`). The `rules` bucket is the only one that writes
  into the user's own rules file; the rest land under the tool's manifest dir.
- `applyBundle()` (`src/lib/writer.ts:270-294`) joins `bundle.rules` and injects
  them as a sentinel block via `applyRulesBlockWithMarkers()`. When
  `bundle.rules.length === 0` it reports `unchanged` and does **nothing** — it
  does not strip an existing block.
- `removeRulesBlockWithMarkers(existing, begin, end)` (`src/lib/sentinel-migration.ts:45`)
  already exists and is the exact strip primitive needed — returns
  `{ content, removed }`, no-ops safely on missing/out-of-order markers.
- User preferences persist in `config.json` via `ToolConfig`
  (`tool`, `lang`, `acknowledgedOrphans`) at `src/lib/config.ts:127`. The
  established pattern is a `get` flag that *also* writes the preference
  (see `--lang` at `get.ts:114-120`).
- **Latent bug**: that `--lang` persist writes `{ tool, lang }`, dropping any
  existing `acknowledgedOrphans` (and would drop `courseRules`). Persistence
  must merge, not clobber.
- CAC negated-flag behavior (verified empirically): a single
  `.option("--no-course-rules")` registration accepts both `--no-course-rules`
  (→ `courseRules:false`) and `--course-rules` (→ `courseRules:true`), and
  defaults to `courseRules:true` when neither is passed. The default and the
  explicit positive form are **indistinguishable** in the parsed options, so a
  tri-state (off / on / unset) requires inspecting argv for the literal flag
  tokens.
- Unregistered flags make CAC throw → `src/index.ts:24` exits `2` (USAGE). The
  flag MUST be registered with CAC even though resolution also peeks argv.
- Rules are **not** manifest-tracked (unlike skills/prompts/configs), so there is
  no removal/manifest bookkeeping to touch — strip is a pure rules-file edit.

## Desired End State

- `10x get m1l1 --no-course-rules` applies skills/prompts/configs but does **not**
  write the course rules block; if a `@przeprogramowani/10x-cli` block already
  exists in the rules file, it is removed (everything outside the markers is
  preserved). The preference is saved (`courseRules:false`) so subsequent plain
  `10x get` runs stay opted out.
- `10x get m1l1 --course-rules` re-enables and persists (`courseRules:true`).
- With `courseRules:false` persisted, `10x get m1l1 --type rules` (an explicit
  request for the rules artifact) **applies rules anyway** — explicit intent wins.
- Default behavior (no flag, no config) is unchanged: the block is applied.
- Human output shows a `[removed] rules …` line when a block is stripped, and the
  rules line is suppressed (not "would write N blocks") when disabled. JSON
  `counts.rules` reflects what was actually applied (0 when disabled).

### Key Discoveries:

- Strip primitive already exists: `removeRulesBlockWithMarkers` (`sentinel-migration.ts:45`).
- `ApplyOptions` (`writer.ts:98`) is the natural seam — add one optional field,
  default preserves current behavior.
- CAC can't express tri-state for a negated boolean (verified) → argv-token check
  is required for the "explicitly re-enable" direction.
- Rules are sentinel-based, not manifest-tracked — disabling needs no manifest changes.
- `filterBundle` (`get.ts:181`) already empties non-selected buckets, so a
  `--type skills` run naturally carries zero rules; the strip must be gated to
  full (non-`--type`) applies so a type-filtered run never touches the rules file.

## What We're NOT Doing

- **Not** touching the `configs` bucket (config-templates). Scope is the rules
  block only.
- **Not** changing the API, the bundle shape, or server behavior. The server still
  returns `rules`; the CLI chooses whether to apply them.
- **Not** adding a standalone `config` subcommand. Persistence rides the existing
  flag-writes-config pattern.
- **Not** stripping the legacy `@przeprogramowani/10x-toolkit` block on disable
  (only the current `10x-cli` markers; `removeRulesBlockWithMarkers` targets the
  profile's current markers).
- **Not** manifest-tracking rules.

## Implementation Approach

Three thin layers, each independently testable: (1) the config field + merge-safe
persistence, (2) the writer's opt-out/strip behavior behind a defaulted
`ApplyOptions` flag, (3) command-level flag registration, tri-state resolution,
the explicit-`--type rules` override, and output rendering. Default-on at every
layer guarantees no behavior change for existing users.

## Critical Implementation Details

- **CAC tri-state**: resolution must derive the explicit flag value from argv
  tokens (`--no-course-rules` → `false`, `--course-rules` → `true`, neither →
  `undefined`), because CAC collapses the default and the positive form to the
  same `courseRules:true`. Keep this in a small pure helper that takes an argv
  array so it is unit-testable without spawning the CLI.
- **Strip gating**: the strip-on-disable path runs only on a full apply (no
  `--type` filter). A `--type rules` request forces apply regardless of the
  setting; any other `--type` filter leaves the rules file untouched.

## Phase 1: Config schema & merge-safe persistence

### Overview

Add the persisted `courseRules` setting to `ToolConfig` and make config writes
merge with the existing on-disk config instead of overwriting it.

### Changes Required:

#### 1. ToolConfig schema + validation

**File**: `src/lib/config.ts`

**Intent**: Add an optional `courseRules` preference so the rules opt-out can be
remembered across invocations. Absent means enabled (default-on). Harden
`readToolConfig` so a hand-edited/tampered non-boolean value is dropped rather
than trusted (mirrors the existing `acknowledgedOrphans` defense-in-depth).

**Contract**: `ToolConfig` gains `courseRules?: boolean` (`config.ts:127`).
`readToolConfig` deletes the field when present and not a boolean. No version
bump — `ToolConfig` is unversioned and additive-optional.

#### 2. Merge-safe persistence

**File**: `src/lib/config.ts`

**Intent**: Provide a way to update individual `ToolConfig` fields without
dropping the others, fixing the latent clobber where persisting `lang` discards
`acknowledgedOrphans`. Callers should be able to set just `courseRules` (or just
`lang`) and keep the rest.

**Contract**: Add `updateToolConfig(patch: Partial<ToolConfig>): void` that reads
the current config, spreads the patch over it, and writes the result via the
existing atomic writer. `saveToolConfig` (full-object write) stays for callers
that intend a full replacement. `tool` remains required in the persisted object —
when no prior config exists, the patch must still yield a valid `{ tool }`
(caller supplies it, as `get.ts` already resolves a `profile.toolId`).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Unit tests pass: `bun test tests/config.test.ts` (or the config test file)
- [ ] New test: `updateToolConfig({ courseRules: false })` on a config that has
  `tool` + `acknowledgedOrphans` preserves both and adds `courseRules:false`.
- [ ] New test: `readToolConfig` drops a non-boolean `courseRules`.

#### Manual Verification:

- [ ] After a disabled `get`, `config.json` contains `"courseRules": false`
  alongside the unchanged `tool`/`lang` fields.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Writer opt-out & strip

### Overview

Teach `applyBundle()` to skip the rules block and strip any existing one when the
course-rules setting is off, behind a defaulted `ApplyOptions` flag.

### Changes Required:

#### 1. ApplyOptions flag

**File**: `src/lib/writer.ts`

**Intent**: Add a switch the command layer can use to disable course rules.
Default `true` so every existing caller (and the partial/`--type` paths) keeps
today's behavior.

**Contract**: `ApplyOptions` (`writer.ts:98`) gains
`applyCourseRules?: boolean` (default `true`).

#### 2. Rules section strip/skip

**File**: `src/lib/writer.ts` (the `--- rules ---` block, `writer.ts:270-294`)

**Intent**: When `applyCourseRules` is `false`, do not write the course block;
instead strip an existing one from the rules file. When `true`, behavior is
exactly as today.

**Contract**: In the rules section, when `applyCourseRules === false`: call
`removeRulesBlockWithMarkers(existingRules, profile.sentinelBegin, profile.sentinelEnd)`;
if it reports `removed` and the content changed, set `rulesAction = "removed"` and
write the stripped content (respecting `dryRun`); otherwise `rulesAction = "unchanged"`.
When `applyCourseRules !== false`, the existing apply path runs unchanged. The
strip path must run even when `bundle.rules` is non-empty (the server still ships
rules; the flag, not the bundle, decides). `WriteResult["rules"].action` already
permits `"removed"` and `"unchanged"` (`ArtifactAction`, `writer.ts:47`).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Writer tests pass: `bun test tests/writer.test.ts`
- [ ] New test: `applyBundle` with `applyCourseRules:false` on a project whose
  rules file already has a `10x-cli` block → block removed, surrounding content
  preserved, `rules.action: "removed"`.
- [ ] New test: `applyCourseRules:false` with no existing block → rules file
  untouched, `rules.action: "unchanged"`.
- [ ] New test: `applyCourseRules:false` + `dryRun:true` → reports `"removed"`
  without modifying the file.
- [ ] Regression: default (`applyCourseRules` omitted) still applies the block and
  is idempotent (`unchanged` on re-apply, byte-identical rules file).

#### Manual Verification:

- [ ] On a real project with course rules in `CLAUDE.md`, a disabled apply leaves
  the file's non-course content (and other sections) intact.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Command wiring, resolution & output

### Overview

Register the flag, resolve the tri-state setting, persist explicit choices, honor
the explicit-`--type rules` override, pass the resolved value into `applyBundle`,
and surface the result in human + JSON output. Document the flag.

### Changes Required:

#### 1. Flag registration

**File**: `src/commands/get.ts`

**Intent**: Expose `--no-course-rules` on `get` so CAC accepts it (and the
positive `--course-rules`) and lists it in help.

**Contract**: Add `.option("--no-course-rules", "Skip applying the course rules block to your rules file (CLAUDE.md/AGENTS.md)")` to the `get` command builder (`get.ts:43-59`). `GetFlags` gains `courseRules?: boolean`.

#### 2. Tri-state resolution helper

**File**: `src/commands/get.ts`

**Intent**: Determine whether the user explicitly set the flag this run, since CAC
can't distinguish default-on from explicit-on. Pure and unit-testable.

**Contract**: `resolveCourseRulesFlag(argv: string[]): boolean | undefined` —
returns `false` if argv contains `--no-course-rules`, else `true` if it contains
`--course-rules`, else `undefined`. Resolution in `runGet`:
`const explicit = resolveCourseRulesFlag(process.argv); const applyCourseRules = explicit ?? readToolConfig()?.courseRules ?? true;`

#### 3. Persistence of explicit choice

**File**: `src/commands/get.ts`

**Intent**: Remember an explicit flag choice across runs, without clobbering other
config fields. Fold the existing `--lang` persist into the same merge-safe write.

**Contract**: When `explicit !== undefined`, call
`updateToolConfig({ courseRules: explicit })` (and migrate the `--lang` persist at
`get.ts:117-120` to `updateToolConfig({ lang })`, ensuring `tool` is seeded when
no config exists). Persistence happens regardless of `--dry-run`? — No: skip
persistence on `--dry-run` so a dry run never mutates config (matches the
"touch nothing" contract of dry-run).

#### 4. Explicit `--type rules` override + writer wiring

**File**: `src/commands/get.ts`

**Intent**: An explicit `--type rules` request applies rules even when the setting
is off; any other `--type` filter leaves rules untouched; a full apply respects
the setting (and strips when off).

**Contract**: Compute the value passed to `applyBundle`:
- `options.type === "rules"` → pass `applyCourseRules: true` (force apply).
- `options.type` set to anything else (`isFiltered`) → pass `applyCourseRules: true` (rules bucket is already empty post-filter, so this is a no-op and the rules file is left alone).
- no `--type` (full apply) → pass the resolved `applyCourseRules` (may strip when false).

Thread the value through the existing `applyBundle({ … })` call (`get.ts:164-169`).

#### 5. Output rendering

**File**: `src/commands/get.ts` (`renderGetResult`, `get.ts:437-515`)

**Intent**: Reflect the disabled/stripped state truthfully instead of the current
"`bundle.rules.length`-keyed" rules line.

**Contract**:
- Human: when `writeResult.rules.action === "removed"`, emit `  [removed] rules  <rulesFile>`; when rules were disabled and nothing was present (`unchanged` with the setting off), suppress the rules line (optionally a `verbose` note). The existing `bundle.rules.length > 0` line stays for the applied case.
- JSON: `counts.rules` should reflect applied blocks — `0` when disabled/removed, `bundle.rules.length` when applied. Keep the `writes.rules` action field as-is (now possibly `"removed"`).

#### 6. Documentation

**File**: `README.md` (and `CLAUDE.md` "Writer & conflict detection" / get-flags area if it enumerates flags)

**Intent**: Document `--no-course-rules` / `--course-rules`, the persisted
`courseRules` setting, the strip-on-disable behavior, and the explicit-`--type
rules` override.

**Contract**: Prose only — a short flag entry + one note on persistence and the
override precedence.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Get tests pass: `bun test tests/get.test.ts`
- [ ] New test: `resolveCourseRulesFlag` returns `false` / `true` / `undefined` for the three argv shapes.
- [ ] New test: plain `get` with `courseRules:false` persisted → `applyBundle` called with `applyCourseRules:false`.
- [ ] New test: `get --type rules` with `courseRules:false` persisted → `applyBundle` called with `applyCourseRules:true` (override).
- [ ] New test: `get --no-course-rules` (not dry-run) persists `courseRules:false`; `--dry-run` variant does not write config.
- [ ] New test: JSON envelope `counts.rules` is `0` when disabled.
- [ ] Full suite passes: `bun test`
- [ ] Build passes: `bun run build`

#### Manual Verification:

- [ ] `10x get m1l1 --no-course-rules` on a fresh project: skills/prompts/configs land, no course block in `CLAUDE.md`, `config.json` shows `courseRules:false`.
- [ ] A subsequent plain `10x get m1l2` stays opted out (no block).
- [ ] `10x get m1l2 --course-rules` re-enables and writes the block; `config.json` shows `courseRules:true`.
- [ ] `10x get m1l1 --type rules` applies the block despite a persisted opt-out.
- [ ] `10x get m1l1 --no-course-rules` on a project that already had the block removes it and leaves the rest of `CLAUDE.md` intact.

**Implementation Note**: Pause for manual confirmation; this is the last phase.

---

## Testing Strategy

### Unit Tests:

- `resolveCourseRulesFlag` tri-state across the three argv shapes.
- `updateToolConfig` merge preserves untouched fields; `readToolConfig` drops a non-boolean `courseRules`.
- `applyBundle` strip path: removes existing block, preserves surrounding content, no-ops when absent, honors `dryRun`.
- Default-on regression: omitting `applyCourseRules` reproduces today's apply + idempotency.

### Integration Tests:

- `get` end-to-end (mocked fetch) for: persisted-off plain run, `--type rules` override, `--no-course-rules`/`--course-rules` persistence, dry-run no-persist, JSON `counts.rules`.

### Manual Testing Steps:

1. Fresh project → `10x get m1l1 --no-course-rules`; confirm no block, config persisted, other artifacts present.
2. Re-run plain `10x get m1l2`; confirm still opted out.
3. `10x get m1l2 --course-rules`; confirm block written and re-enabled.
4. Project with an existing block → `--no-course-rules`; confirm surgical strip.
5. `--type rules` with opt-out persisted; confirm override applies the block.

## Performance Considerations

None — one extra small string operation on the rules file, gated to a single apply.

## Migration Notes

`ToolConfig` is unversioned and additive-optional; existing `config.json` files
without `courseRules` read as enabled (default-on). No migration step.

## References

- Change notes: `context/changes/disable-course-rules/change.md`
- Strip primitive: `src/lib/sentinel-migration.ts:45` (`removeRulesBlockWithMarkers`)
- Writer rules section: `src/lib/writer.ts:270-294`
- Flag-writes-config precedent: `src/commands/get.ts:114-120`
- Tool profiles (rules files): `src/lib/tool-profile.ts:26-111`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Config schema & merge-safe persistence

#### Automated

- [x] 1.1 Type checking passes: `bun run typecheck` — b644d7c
- [x] 1.2 Linting passes: `bun run lint` — b644d7c
- [x] 1.3 Unit tests pass: config test file — b644d7c
- [x] 1.4 `updateToolConfig({ courseRules: false })` preserves `tool` + `acknowledgedOrphans` — b644d7c
- [x] 1.5 `readToolConfig` drops a non-boolean `courseRules` — b644d7c

#### Manual

- [ ] 1.6 After a disabled `get`, `config.json` has `courseRules:false` with other fields intact

### Phase 2: Writer opt-out & strip

#### Automated

- [x] 2.1 Type checking passes: `bun run typecheck` — b856bd9
- [x] 2.2 Linting passes: `bun run lint` — b856bd9
- [x] 2.3 Writer tests pass: `bun test tests/writer.test.ts` — b856bd9
- [x] 2.4 Strip existing block, preserve surrounding content, `rules.action: "removed"` — b856bd9
- [x] 2.5 No existing block → untouched, `rules.action: "unchanged"` — b856bd9
- [x] 2.6 `dryRun` reports `"removed"` without modifying the file — b856bd9
- [x] 2.7 Default (omitted flag) still applies + idempotent — b856bd9

#### Manual

- [ ] 2.8 Real-project disabled apply leaves non-course `CLAUDE.md` content intact

### Phase 3: Command wiring, resolution & output

#### Automated

- [x] 3.1 Type checking passes: `bun run typecheck`
- [x] 3.2 Linting passes: `bun run lint`
- [x] 3.3 Get tests pass: `bun test tests/get.test.ts`
- [x] 3.4 `resolveCourseRulesFlag` tri-state across three argv shapes
- [x] 3.5 Persisted-off plain run → `applyCourseRules:false`
- [x] 3.6 `--type rules` with persisted-off → `applyCourseRules:true` (override)
- [x] 3.7 `--no-course-rules` persists; `--dry-run` does not write config
- [x] 3.8 JSON `counts.rules` is `0` when disabled
- [x] 3.9 Full suite passes: `bun test`
- [x] 3.10 Build passes: `bun run build`

#### Manual

- [ ] 3.11 Fresh-project `--no-course-rules`: artifacts land, no block, config persisted
- [ ] 3.12 Subsequent plain `get` stays opted out
- [ ] 3.13 `--course-rules` re-enables + writes block
- [ ] 3.14 `--type rules` applies block despite persisted opt-out
- [ ] 3.15 Existing block stripped surgically, rest of `CLAUDE.md` intact
