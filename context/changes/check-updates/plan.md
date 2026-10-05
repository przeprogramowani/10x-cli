# `10x changelog` Implementation Plan

## Overview

Learners have no way to see what changed in the course's AI artifacts (skills, prompts, rules, config templates) since they last pulled. This plan makes `10x sync` (and a successful `10x get`) record the newest 10x-toolkit release version in the project manifest, and adds `10x changelog`, an authenticated read-only command that shows the toolkit release changelog since that recorded version. Whether downloaded files are out of date stays the job of `10x sync`.

## Current State Analysis

- `10x sync` detects upstream content changes by comparing the catalog `contentHash` with the stored `catalogContentHash` (`src/commands/sync.ts:264-275`); `--dry-run` previews per-resource changes but downloads every changed lesson.
- The manifest records the CLI's own `version`, `lastApplied`, and per-lesson `appliedAt`, `catalogContentHash`, `installedReleaseId` (an opaque `r-<sha256>`), but **no 10x-toolkit release version** (`src/lib/manifest.ts:32-79`).
- There is no "what changed" surface anywhere in the CLI; `doctor` only checks the CLI's npm version (`src/lib/update-check.ts`).
- 10x-toolkit change `release-changelog` (planned 2026-10-05) adds `GET /api/changelog?since=<vX.Y.Z>|sinceDate=<date>&limit=<1-100>` → `200 { entries: ChangelogEntry[] }` newest-first, any valid JWT; `since` is exclusive by version, `sinceDate` inclusive (date-only = start of that UTC day); both together → `400 invalid_query`. The endpoint is not deployed and not in `src/generated/api-types.ts` yet.

## Desired End State

- After `10x sync` in a project, the manifest carries `toolkit: { version: "v2.59.2", recordedAt: <ISO> }`.
- `10x changelog` in that project prints "No toolkit changes since v2.59.2" until a newer toolkit release exists, then prints those releases' changelogs newest-first.
- `10x changelog --since 2026-10-01` and `--since v2.55.0` browse history regardless of the baseline.
- Against an older backend without the endpoint, sync and get behave exactly as today, and `10x changelog` explains that the backend does not support it yet.
- Verify: `bun test`, then the `verify-10x-cli` fake API run described in Phase 3.

### Key Discoveries:

- Command registration: `src/index.ts:10-22`; read-only authenticated template `src/commands/list.ts` and `tests/list-command.test.ts`.
- Auth: `requireAuth(ctx)` in `src/lib/auth-guard.ts` (missing auth → `auth_required`, exit 3; refresh handled inside).
- Typed API wrappers: `src/lib/api-content.ts`; 404-as-unsupported precedent `api-content.ts:41` (`discovery_unsupported`); error messages table `src/lib/api-client.ts:94-127`.
- Manifest I/O: `readManifest` / atomic `writeManifest` / `isManifest` (`src/lib/manifest.ts:87-133`); sync only writes the manifest when it applies a lesson (`src/lib/writer.ts:270`), so recording needs its own write.
- Test mock gotcha: `tests/helpers/api-content-mock.ts` re-lists every export; a new export must be added to the factory and state or it is `undefined` in every test that loads the mock.
- Skill docs: `skills/10x-cli-guide/SKILL.md` (`## Update`, frontmatter command list); `references/compatibility.md` must stay byte-identical across both CLI skills (`bun run validate:cli-skills`).

## What We're NOT Doing

- No content diff in `10x changelog` (which downloaded files are stale): `10x sync` / `--dry-run` already cover it.
- No hint printed after other commands, no background or periodic checks.
- No non-zero exit code for "there are new entries".
- No global (config-dir) baseline; the baseline is per project.
- No markdown rendering library; changelog markdown is printed as-is.
- No changes in 10x-toolkit; the endpoint is delivered by its `release-changelog` change.

## Implementation Approach

Two small additions joined by one stored value. Writers (`sync`, `get`) ask the endpoint for the single newest entry after a successful pull and store its version; the reader (`changelog`) turns the stored baseline into `since`, with date and empty fallbacks for projects that predate the feature. Every API call degrades on 404 so the CLI can ship before or after the toolkit deploy.

## Critical Implementation Details

**State sequencing** — record the toolkit version only after the pull has finished: for `sync`, when not `--dry-run` and no lesson ended `errored`; for `get`, after a complete successful apply. Re-read the manifest immediately before writing the field so lesson ownership written during the run is never overwritten by a stale copy. A conflicted (skipped) lesson does not block recording: the user was offered that content.

## Phase 1: Changelog Client and Baseline Recording

### Overview

Add the API wrapper and record the toolkit version on successful pulls.

### Changes Required:

#### 1. API wrapper

**File**: `src/lib/api-content.ts`, `src/lib/api-client.ts`

**Intent**: `fetchChangelog(token, { since?, sinceDate?, limit? })` calling `GET /api/changelog`, with a hand-written `ChangelogResponse` type and runtime validator until generated types include the route. A 404 becomes `changelog_unsupported`; add its message to the error table.

**Contract**: `ChangelogEntry = { version, previousVersion, releasedAt, model, markdown, artifacts: { skills, prompts, rules, configTemplates: { name, status }[] } }`; returns `ApiResult<{ entries: ChangelogEntry[] }>`.

#### 2. Manifest field

**File**: `src/lib/manifest.ts`

**Intent**: Optional top-level `toolkit: { version: string; recordedAt: string }`, additive within manifest schema 3 (older CLIs ignore it). `isManifest` accepts it; a malformed value is ignored on read rather than failing the manifest.

**Contract**: `CliManifest.toolkit?: { version: string; recordedAt: string }`; helper `recordToolkitVersion(dir, version, now)` that re-reads, sets the field and writes atomically; no-op when no manifest exists.

#### 3. Recording in sync and get

**Files**: `src/commands/sync.ts`, `src/commands/get.ts`

**Intent**: After a successful pull (see Critical Implementation Details), call `fetchChangelog(token, { limit: 1 })` and record `entries[0].version`. Any failure (404, network, empty list, validation) is silent in human mode and leaves the manifest untouched; it never changes the command's exit code or JSON envelope.

**Contract**: sync/get JSON output unchanged.

#### 4. Tests

**Files**: `tests/helpers/api-content-mock.ts`, `tests/sync-*.test.ts` / `tests/get-*.test.ts` (existing files), new `tests/manifest-toolkit.test.ts`

**Intent**: Extend the shared mock with `fetchChangelog`. Cover: recording after a sync where every lesson was unchanged; no recording on `--dry-run` or when a lesson errored; 404 leaves manifest and exit code unchanged; malformed `toolkit` field ignored; record after `get`.

### Success Criteria:

#### Automated Verification:

- Tests pass: `bun test`
- Typecheck and lint pass: `bun run typecheck && bun run lint`

#### Manual Verification:

- Against the fake API, `10x sync` in a project adds `toolkit.version` to `.10x-cli-manifest.json`, and with the changelog route removed the manifest and output match today's behaviour

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: `10x changelog` Command

### Overview

Show toolkit changes since the project's baseline, or since an explicit version or date.

### Changes Required:

#### 1. Command

**File**: `src/commands/changelog.ts`, registered in `src/index.ts`

**Intent**: Authenticated (`requireAuth`), read-only. Baseline resolution in order: `--since` flag (`vX.Y.Z` → `since`; `YYYY-MM-DD` → `sinceDate`; anything else → usage error, exit 2) → manifest `toolkit.version` → newest lesson `appliedAt` (or `lastApplied`) as `sinceDate` → no manifest: latest 5 entries with the hint "Run 10x sync to record your baseline". `--limit` (default 20). Human output: a header naming the baseline and its source, then each entry as `vX.Y.Z — <date>` followed by its markdown, or "No toolkit changes since <baseline>". `changelog_unsupported` → `outputError` exit 1 with an explanatory hint.

**Contract**: JSON `{ status: "ok", data: { baseline: { source: "flag" | "sync" | "applied" | "none", version?, date? }, newEntries: number, entries: ChangelogEntry[] } }`; exit 0 whether or not entries exist; auth missing → 3.

#### 2. Tests

**File**: `tests/changelog-command.test.ts` (modelled on `tests/list-command.test.ts`)

**Intent**: Cover each baseline source and the query it sends (`since` vs `sinceDate` vs `limit=5`), invalid `--since` → exit 2, no auth → exit 3, unsupported backend → exit 1 with code, empty result message, JSON envelope shape with `newEntries`.

**Contract**: uses the shared api-content mock and config isolation helpers.

### Success Criteria:

#### Automated Verification:

- Tests pass: `bun test`
- Typecheck, lint and the offline quality gate pass: `bun run typecheck && bun run lint && bun run quality:fast`

#### Manual Verification:

- Against the fake API: a freshly synced project prints "No toolkit changes since vX"; after adding a newer fake entry it prints that entry; `--since 2026-10-01` lists all entries from that day

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Docs, Live Verification and Generated Types

### Overview

Document the command, teach the verification skill about it, and switch to generated types once the toolkit endpoint is live.

### Changes Required:

#### 1. Docs and skills

**Files**: `README.md` (commands table + `### 10x changelog`), `skills/10x-cli-guide/SKILL.md` (`## Update` section and frontmatter command list), `CLAUDE.md` (command note: baseline recording in sync/get)

**Intent**: Explain what the command shows, how the baseline is recorded and the `--since` forms; state clearly that it describes toolkit releases, while `10x sync --dry-run` shows what would be downloaded.

**Contract**: `bun run validate:cli-skills` stays green (compatibility references unchanged or updated in both skills).

#### 2. Live verification

**Files**: `.claude/skills/verify-10x-cli/scripts/fake-api.ts`, `.claude/skills/verify-10x-cli/features/changelog.md`

**Intent**: Fake `GET /api/changelog` honouring `since` / `sinceDate` / `limit` with the toolkit's boundary rules, plus a feature doc with the sync → changelog walkthrough.

**Contract**: route mirrors the toolkit contract, including `400 invalid_query` for both params.

#### 3. Generated types

**File**: `src/generated/api-types.ts` (via `bun run generate-types`), `src/lib/api-content.ts`

**Intent**: After the toolkit's `release-changelog` Phase 4 is deployed, regenerate types and derive `ChangelogResponse` from `paths["/api/changelog"]`, removing the hand-written type.

**Contract**: never hand-edit the generated file.

### Success Criteria:

#### Automated Verification:

- Skill validation passes: `bun run validate:cli-skills`
- Full offline gate passes: `bun run quality:gate`
- Generated types include `/api/changelog` and typecheck passes: `bun run generate-types && bun run typecheck`

#### Manual Verification:

- `verify-10x-cli` walkthrough for the changelog feature passes against the fake API
- After the toolkit deploy, `10x changelog --since v2.58.1` against production returns v2.59.2, v2.59.1, v2.59.0

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Manifest field read/write and malformed-value tolerance.
- Baseline resolution order and the query each source produces.
- Recording rules in sync/get (dry-run, errored lesson, 404, empty list).

### Integration Tests:

- Fake API walkthrough: `10x auth` → `10x sync` → `10x changelog` → add newer fake release → `10x changelog`.

### Manual Testing Steps:

1. Sync a project against the fake API and inspect the manifest.
2. Run `10x changelog` before and after adding a newer fake entry.
3. After the toolkit deploy, run against production with a learner account.

## Performance Considerations

Recording adds one small request (`limit=1`) to each successful sync/get; `10x changelog` makes one request. No caching needed.

## Migration Notes

Existing manifests have no `toolkit` field; `10x changelog` falls back to the newest `appliedAt` until the next sync records a version. Older CLIs reading a new manifest ignore the field.

## References

- Prior art: `context/changes/bulk-sync-update/` (structure-over-flags decision, catalog digest comparison)
- Toolkit endpoint: 10x-toolkit `context/changes/release-changelog/plan.md` (Phase 4)
- Patterns: `src/commands/list.ts`, `tests/list-command.test.ts`, `src/lib/api-content.ts:41`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Changelog Client and Baseline Recording

#### Automated

- [x] 1.1 Tests pass — 47268ae
- [x] 1.2 Typecheck and lint pass — 47268ae

#### Manual

- [ ] 1.3 Against the fake API, `10x sync` records `toolkit.version`, and without the changelog route the manifest and output match today's behaviour

### Phase 2: `10x changelog` Command

#### Automated

- [x] 2.1 Tests pass — 0767427
- [x] 2.2 Typecheck, lint and the offline quality gate pass — 0767427

#### Manual

- [ ] 2.3 Against the fake API, the command reports no changes after sync, shows a newer entry once added, and `--since <date>` lists that day's entries

### Phase 3: Docs, Live Verification and Generated Types

#### Automated

- [x] 3.1 Skill validation passes
- [x] 3.2 Full offline gate passes
- [ ] 3.3 Generated types include `/api/changelog` and typecheck passes

#### Manual

- [ ] 3.4 `verify-10x-cli` walkthrough for the changelog feature passes against the fake API
- [ ] 3.5 After the toolkit deploy, `10x changelog --since v2.58.1` against production returns v2.59.2, v2.59.1, v2.59.0
