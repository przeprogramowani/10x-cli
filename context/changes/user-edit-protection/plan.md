# User-Edit Protection Implementation Plan

## Overview

Add three-way conflict detection to the CLI's write path so that user-modified skill and prompt files are detected and the user is prompted before overwriting. Also surface `[removed]` entries in output so file deletions during lesson transitions are visible.

## Current State Analysis

The CLI's `applyBundle()` in `writer.ts` treats local files as a dumb cache — `computeFileAction()` does a binary same/different check and unconditionally overwrites if content differs. The manifest (`manifest.ts:19-22`) stores only filenames, not content hashes, so three-way conflict detection is structurally impossible. File removals during lesson transitions are silent — `computeRemovals()` results are consumed but never surfaced in `WriteResult` or rendered in output.

### Key Discoveries:

- `sha256Hex()` already exists in `signing.ts:68-70` — same hash function needed here (`createHash("sha256")` from `node:crypto`)
- `@clack/prompts` 0.9.1 is the interactive prompt library, with established patterns in `tool-prompt.ts:74-82` (select) and `tool-prompt.ts:130` (isCancel)
- `clack-mock.ts` test helper already exists for mocking `@clack/prompts` — can extend for new prompt types
- The API sends `contentHash` per-artifact (`api-types.ts:116,122,128,134`) but the CLI's runtime types strip it — we'll compute hashes locally instead for per-file granularity
- Configs use skip-on-exists (`writer.ts:185`) and rules use sentinel markers — neither needs conflict detection. Only skills and prompts need hash tracking
- `ArtifactAction` type already includes `"removed"` but it's never produced by the writer

## Desired End State

After this change:
1. Running `10x get` when a locally-modified skill or prompt file would be overwritten triggers an interactive per-file prompt: **overwrite / save as `.user.<ext>` / skip**, with an **apply-to-all** option for bulk resolution
2. In non-TTY mode (CI, piped, AI agents), conflicts default to **skip** — user work is never silently destroyed
3. File removals during lesson transitions appear as `[removed]` lines in both human output and JSON envelope
4. The manifest stores per-file SHA-256 content hashes, enabling accurate three-way detection on subsequent applies

To verify: apply a lesson, manually edit a skill file, re-apply the same or a different lesson, and confirm the conflict prompt appears. Verify `[removed]` lines appear when switching between lessons with different artifact sets.

## What We're NOT Doing

- **Conflict detection for configs** — configs already use skip-on-exists semantics
- **Conflict detection for rules** — rules use sentinel markers with user content preserved outside
- **Protection against removing user-edited files** — removals are surfaced visually but not gated by a prompt (future follow-up)
- **Using the API's `contentHash` field** — we compute per-file hashes locally for consistency and finer granularity than the API's per-skill hash
- **Cumulative manifest tracking** — that's a separate change (`context/changes/cumulative-manifest/`)
- **`--force` flag to bypass prompts** — can be added later if needed

## Implementation Approach

Three-phase approach: schema first, then writer logic, then UX layer.

1. **Manifest v3** adds optional `contentHashes` fields to the existing schema. The `isManifest()` validator accepts both v2 and v3, so existing manifests continue working. v2 manifests (no hashes) trigger the "compute from disk" upgrade path — any content difference on the first apply after upgrade is treated as a potential conflict and prompts the user.

2. **Writer changes** make `applyBundle()` async and inject a `ConflictResolver` callback via `ApplyOptions`. When `computeFileAction()` detects a conflict (local hash ≠ stored hash AND local content ≠ new content), the resolver is called. The writer also tracks removals in `WriteResult` and stores per-file hashes in the manifest at write time.

3. **UX layer** wires `@clack/prompts` into the conflict resolver callback in `get.ts`. TTY mode shows a per-file `select()` prompt with 4 options (overwrite / save-as-user / skip / apply-to-all). Non-TTY mode returns `"skip"` unconditionally. Output rendering adds `[removed]` lines and conflict-action labels.

## Critical Implementation Details

**Hash stability**: Content hashes are computed with `createHash("sha256").update(content, "utf8").digest("hex")` — the same algorithm used in `signing.ts:68-70`. The hash is of the UTF-8 string content, not raw bytes. This means binary files (if any were ever bundled) would need separate handling, but the CLI only writes text artifacts.

**v2 manifest upgrade path**: When a file has no stored hash (v2 manifest), `computeFileAction()` cannot distinguish "user edited" from "legitimate upstream change." Per the design decision, any content difference triggers a prompt on the first apply after upgrade. This is a one-time cost — after resolution, hashes are stored and subsequent applies use accurate three-way detection. A `note()` message warns the user that this is a first-run calibration.

---

## Phase 1: Manifest v3 Schema + Hash Utility

### Overview

Extend the manifest schema to store per-file content hashes for skills and prompts. Export a reusable `contentHash()` function. Maintain backward compatibility with v2 manifests.

### Changes Required:

#### 1. Manifest schema update

**File**: `src/lib/manifest.ts`

**Intent**: Add optional `contentHashes` fields to the manifest types and bump the schema version to 3, while continuing to accept v2 manifests as valid (they just lack hashes).

**Contract**:
- `MANIFEST_VERSION` changes from `2` to `3`
- `CliManifestSkillEntry` gains an optional `contentHashes?: Record<string, string>` field (keys are relative file paths like `"SKILL.md"`, values are SHA-256 hex strings)
- `CliManifest.files` gains an optional `promptHashes?: Record<string, string>` field (keys are prompt filenames like `"plan.md"`, values are SHA-256 hex strings)
- `isManifest()` accepts `manifestVersion` of both `2` and `3`
- `isSkillsRecord()` continues to validate — the new field is optional so existing v2 entries pass
- The `CliManifest` type keeps `manifestVersion: typeof MANIFEST_VERSION` (which is now `3`), but `isManifest()` accepts `2` at runtime for backward compat. The type annotation says `3` because new manifests are always written as v3

#### 2. Content hash utility

**File**: `src/lib/manifest.ts`

**Intent**: Export a `contentHash()` function that computes the SHA-256 hex digest of a UTF-8 string. Co-located with the manifest module since it's the manifest that stores hashes. Uses the same algorithm as `signing.ts:sha256Hex()` but is a separate export to avoid coupling manifest logic to the signing module.

**Contract**: `export function contentHash(content: string): string` — returns a 64-character lowercase hex string.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `bun run typecheck`
- Linting passes: `bun run lint`
- Existing manifest tests still pass: `bun test tests/manifest.test.ts`
- Existing writer tests still pass: `bun test tests/writer.test.ts`

#### Manual Verification:

- Apply a lesson with the updated CLI, confirm the manifest on disk contains `manifestVersion: 3` and `contentHashes` fields for skills and `promptHashes` for prompts
- Confirm a project with an existing v2 manifest can still be read (no crash, treated as valid)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Writer Three-Way Detection + Removal Tracking

### Overview

Modify the writer to detect user-edited files via three-way hash comparison, accept a conflict resolution callback, track removals in `WriteResult`, and store content hashes in the manifest. This phase makes `applyBundle()` async.

### Changes Required:

#### 1. Extended action types and result shapes

**File**: `src/lib/writer.ts`

**Intent**: Add new `ArtifactAction` values for conflict outcomes and extend `WriteResult` to carry removal entries alongside write entries.

**Contract**:
- `ArtifactAction` union gains three members: `"conflict_overwritten"` | `"conflict_saved_user"` | `"conflict_skipped"`
- `WriteResult` gains a `removals` field: `{ skills: ArtifactWrite[]; prompts: ArtifactWrite[]; configs: ArtifactWrite[] }` — each entry has `action: "removed"`
- `SkillFileWrite` gains an optional `userBackupPath?: string` field — populated when the resolution is `"conflict_saved_user"`, pointing to the `.user.<ext>` backup

#### 2. ConflictResolver callback type

**File**: `src/lib/writer.ts`

**Intent**: Define the conflict resolution callback type that the command layer injects. The writer calls this when a conflict is detected; the callback returns the user's choice.

**Contract**:
```typescript
export interface ConflictInfo {
  artifactType: "skill" | "prompt";
  artifactName: string;
  filePath: string;
  relativePath: string;
}

export type ConflictResolution = "overwrite" | "save_user" | "skip";
export type ConflictResolver = (info: ConflictInfo) => Promise<ConflictResolution>;
```

`ApplyOptions` gains an optional `onConflict?: ConflictResolver` field. When absent and a conflict is detected, the writer defaults to `"skip"` (safe default matching non-TTY behavior).

#### 3. Three-way detection in computeFileAction

**File**: `src/lib/writer.ts`

**Intent**: Enhance `computeFileAction()` to accept a stored hash and return whether the content difference is a conflict (user-edited) or a clean upstream update.

**Contract**: The function signature changes from `(filePath, newContent) → ArtifactAction` to `(filePath, newContent, storedHash?) → { action: ArtifactAction; isConflict: boolean }`. The three-way logic:
- File doesn't exist → `{ action: "created", isConflict: false }`
- Can't read file → `{ action: "updated", isConflict: false }`
- Content identical to new → `{ action: "unchanged", isConflict: false }`
- Content differs, stored hash exists, local hash matches stored hash → `{ action: "updated", isConflict: false }` (clean upstream update)
- Content differs, stored hash exists, local hash ≠ stored hash → `{ action: "updated", isConflict: true }` (user edited)
- Content differs, no stored hash (v2 upgrade) → `{ action: "updated", isConflict: true }` (can't distinguish — prompt)

#### 4. Async applyBundle with conflict handling

**File**: `src/lib/writer.ts`

**Intent**: Make `applyBundle()` async. When `computeFileAction()` reports a conflict, call `onConflict()` and apply the resolution: overwrite writes the new content, save-as-user copies the local file to `.user.<ext>` then writes the new content, skip leaves the file untouched.

**Contract**:
- `applyBundle()` return type changes from `WriteResult` to `Promise<WriteResult>`
- For `"save_user"` resolution: the local file at `path/to/foo.md` is copied to `path/to/foo.user.md` (for `.md` files) or `path/to/foo.user.<ext>` (for other extensions), then the new content is written to the original path
- For `"skip"` resolution: the file is left untouched, the action in WriteResult is `"conflict_skipped"`, and the manifest hash for this file is NOT updated (keeps the old hash so the conflict is re-detected on next apply)
- For `"overwrite"` resolution: the new content is written, the action is `"conflict_overwritten"`, and the manifest hash updates to the new content's hash

#### 5. Hash storage in manifest building

**File**: `src/lib/writer.ts`

**Intent**: When building the next manifest at the end of `applyBundle()`, compute and store the SHA-256 hash of each written file's content. For files that were conflict-skipped, carry forward the old hash from the previous manifest (or omit if no previous hash existed).

**Contract**: The `nextManifest` construction block (currently `writer.ts:206-222`) stores:
- `skills[name].contentHashes`: `Record<string, string>` mapping each file's relative path to `contentHash(file.content)` — except for conflict-skipped files, which carry forward `prevManifest.files.skills[name]?.contentHashes?.[relPath]`
- `files.promptHashes`: `Record<string, string>` mapping each prompt filename to `contentHash(prompt.content)` — except for conflict-skipped prompts, which carry forward `prevManifest.files.promptHashes?.[filename]`

#### 6. Removal tracking

**File**: `src/lib/writer.ts`

**Intent**: After `computeRemovals()` runs and files are deleted, add the removed entries to the `WriteResult` so callers can render them.

**Contract**: The removal loop (currently `writer.ts:193-202`) populates `WriteResult.removals` with `ArtifactWrite` entries: `{ name, path, action: "removed" }` for each deleted prompt, config, skill dir, and skill file. Skill dirs produce one entry per skill (not per file inside the dir). The `removals` field is populated even in dry-run mode (using `computeRemovals()` output without actually deleting).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `bun run typecheck`
- Linting passes: `bun run lint`
- All existing writer tests updated for async and pass: `bun test tests/writer.test.ts`
- Build succeeds: `bun run build`

#### Manual Verification:

- Apply a lesson, manually edit a skill SKILL.md, re-apply — confirm `applyBundle()` calls `onConflict` (test with a simple logging resolver)
- Apply lesson A then lesson B — confirm `WriteResult.removals` contains the artifacts exclusive to A
- Confirm the manifest on disk contains `contentHashes` for skills and `promptHashes` for prompts after a clean apply

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Interactive Prompts + Output Rendering

### Overview

Wire the conflict resolution UX into the `get` command. TTY mode shows per-file `@clack/prompts` select prompts with an apply-to-all option. Non-TTY mode silently skips. Output rendering gains `[removed]` lines and conflict-specific action labels.

### Changes Required:

#### 1. Conflict resolver factory

**File**: `src/lib/conflict-prompt.ts` (new file)

**Intent**: Encapsulate the interactive conflict resolution logic in a standalone module that the `get` command passes as `onConflict` to `applyBundle()`. Separates prompt UX from writer logic.

**Contract**:
- `export function createConflictResolver(tty: boolean): ConflictResolver` — factory that returns:
  - **TTY mode**: a resolver that shows a `p.select()` prompt per conflicting file with 4 options:
    1. `Overwrite` — replace local file with upstream content
    2. `Save as .user.<ext>` — back up local version, then overwrite with upstream
    3. `Skip` — keep local version, don't update
    4. `Apply to all remaining` — apply the currently highlighted choice to all subsequent conflicts without prompting
  - The prompt message includes the artifact type and name: e.g. `"skill code-review/SKILL.md was modified locally."`
  - If the user cancels (`p.isCancel()`), treat as `"skip"` for that file and continue
  - **Non-TTY mode**: returns `"skip"` immediately for every conflict

- Internal state tracks the "apply-to-all" choice. Once set, subsequent calls return that resolution without prompting.

#### 2. v2 upgrade notice

**File**: `src/lib/conflict-prompt.ts`

**Intent**: On the first apply after upgrading from a v2 manifest, show a one-time `p.note()` explaining that content hashes are being established and some files may trigger conflict prompts even if the user didn't edit them.

**Contract**: `export function showUpgradeNotice(): void` — called from `get.ts` when the previous manifest exists but has `manifestVersion === 2`. Shows: `"First run after CLI update: content tracking is being established. Files changed between lessons may trigger a conflict prompt this one time."` In non-TTY mode, emits a `[verbose]` line instead.

#### 3. Get command integration

**File**: `src/commands/get.ts`

**Intent**: Pass the conflict resolver to `applyBundle()` and handle the async return. Add v2 upgrade notice when applicable.

**Contract**:
- Import `createConflictResolver` and `showUpgradeNotice` from `../lib/conflict-prompt`
- Before calling `applyBundle()`, check if the previous manifest is v2 (read manifest, check `manifestVersion === 2`) — if so, call `showUpgradeNotice()` when TTY
- Pass `onConflict: createConflictResolver(process.stdout.isTTY === true)` in `ApplyOptions`
- `applyBundle()` is now async — add `await`

#### 4. Output rendering for removals and conflicts

**File**: `src/commands/get.ts`

**Intent**: Extend `renderGetResult()` to show `[removed]` lines and conflict-specific action labels in both human and JSON output.

**Contract**:
- Human output: after the existing write lines, render removal entries with the same format: `  [removed] skill  <path>`, `  [removed] prompt <path>`, `  [removed] config <path>`
- Human output: conflict actions render as `[conflict: overwritten]`, `[conflict: saved .user]`, `[conflict: skipped]` instead of plain `[updated]` or `[skipped]`
- JSON output: `writes` object gains a `removals` field mirroring `WriteResult.removals`. Conflict actions appear as their actual values (`"conflict_overwritten"`, etc.) in the `action` field. `SkillFileWrite.userBackupPath` is included when present.
- `counts` object gains `removals: number` (total removed across all types)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `bun run typecheck`
- Linting passes: `bun run lint`
- All tests pass: `bun test`
- Build succeeds: `bun run build`
- Binary build succeeds: `bun run build:binary`

#### Manual Verification:

- TTY: apply a lesson, edit a skill file, re-apply — see the interactive conflict prompt with 4 options, choose each option at least once and verify the correct behavior (overwrite writes new content, save-as-user creates backup, skip preserves local)
- TTY: trigger multiple conflicts, use "apply to all remaining" — verify subsequent conflicts resolve without prompting
- Non-TTY: pipe output (`10x get m1l1 | cat`) with a conflicting file — confirm it's skipped silently and JSON output contains `"conflict_skipped"`
- Apply lesson A then lesson B — confirm `[removed]` lines appear for artifacts exclusive to A
- JSON mode: verify the `removals` field and `counts.removals` in the JSON envelope

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests

### Overview

Add comprehensive test coverage for conflict detection, removal tracking, hash storage, and the v2 upgrade path. Update existing tests that break due to `applyBundle()` becoming async.

### Changes Required:

#### 1. Update existing writer tests for async

**File**: `tests/writer.test.ts`

**Intent**: All existing `applyBundle()` calls need `await` since the function is now async. Update every `it()` callback to be async and `await` each `applyBundle()` call.

**Contract**: Every test that calls `applyBundle()` becomes an async test with `await`. No behavioral change — existing assertions remain identical.

#### 2. Conflict detection tests

**File**: `tests/writer.test.ts`

**Intent**: Add a new `describe` block testing three-way conflict detection for skills and prompts.

**Contract**: New test cases covering:
- Clean upstream update (file matches stored hash, new content differs) → `"updated"`, no conflict callback invoked
- User-edited file (file differs from stored hash, new content also differs) → conflict callback invoked with correct `ConflictInfo`
- User-edited file matching new content (file differs from stored hash but matches new content) → `"unchanged"`, no conflict
- Conflict resolved as overwrite → file contains new content, action is `"conflict_overwritten"`, manifest hash updated
- Conflict resolved as save-as-user → `.user.md` backup exists with old content, file contains new content, action is `"conflict_saved_user"`, `userBackupPath` populated
- Conflict resolved as skip → file unchanged, action is `"conflict_skipped"`, manifest hash NOT updated (old hash preserved)
- No `onConflict` callback provided → defaults to skip (safe default)
- Multiple conflicts with resolver returning different resolutions per file

#### 3. v2 manifest upgrade path tests

**File**: `tests/writer.test.ts`

**Intent**: Test the behavior when a v2 manifest (no hashes) is encountered.

**Contract**: New test cases covering:
- v2 manifest on disk, file content matches new bundle → `"unchanged"`, no conflict
- v2 manifest on disk, file content differs from new bundle → conflict callback invoked (false positive accepted per design decision)
- After first apply with v2 manifest, manifest on disk is v3 with hashes → subsequent apply uses three-way correctly

#### 4. Removal tracking tests

**File**: `tests/writer.test.ts`

**Intent**: Test that removals appear in `WriteResult.removals`.

**Contract**: New test cases covering:
- Apply A then B → `WriteResult.removals` contains skills and prompts exclusive to A
- Dry-run with removals → `WriteResult.removals` populated but files not deleted
- No previous manifest → `removals` is empty
- JSON output includes `removals` field (test via `renderGetResult` or integration)

#### 5. Hash persistence tests

**File**: `tests/writer.test.ts`

**Intent**: Verify that content hashes are correctly stored in the manifest after apply.

**Contract**: New test cases covering:
- After fresh apply, manifest contains `contentHashes` for each skill file and `promptHashes` for each prompt
- Hash values match `contentHash(file.content)` for each file
- After conflict-skip, the skipped file's hash is NOT updated in the manifest
- After conflict-overwrite, the overwritten file's hash IS updated
- After conflict-save-user, the hash IS updated (new content was written)

#### 6. Conflict prompt tests

**File**: `tests/get-command.test.ts` (or new `tests/conflict-prompt.test.ts`)

**Intent**: Test the interactive prompt behavior using the existing `clack-mock.ts` helper.

**Contract**: New test cases covering:
- TTY mode: conflict triggers `p.select()` call with correct options
- Non-TTY mode: no prompt, returns `"skip"`
- Cancel handling: `p.isCancel()` returns true → treated as skip
- Apply-to-all: after choosing "apply to all", subsequent conflicts resolve without prompting

### Success Criteria:

#### Automated Verification:

- All tests pass: `bun test`
- Type checking passes: `bun run typecheck`
- No test regressions in CI: full CI pipeline passes

#### Manual Verification:

- Review test coverage — confirm all three-way detection branches are exercised
- Confirm no existing test was broken or had its assertions weakened

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `computeFileAction()` with all six branches (created, can't-read, unchanged, clean-update, user-edit-conflict, no-hash-conflict)
- `contentHash()` produces stable SHA-256 hex output
- `isManifest()` accepts v2 and v3, rejects v1
- `computeRemovals()` output flows into `WriteResult.removals`
- Save-as-user file naming: `.md` → `.user.md`, `.sh` → `.user.sh`, `.json` → `.user.json`

### Integration Tests:

- Full apply → edit → re-apply cycle with each resolution (overwrite, save-user, skip)
- v2 manifest → upgrade apply → v3 manifest with hashes → clean apply
- Lesson A → lesson B transition with removals visible in WriteResult
- Partial apply (`--type`/`--name`) skips cleanup and conflict detection

### Manual Testing Steps:

1. Apply m1l1, edit `.claude/skills/code-review/SKILL.md`, run `10x get m1l1` again — verify conflict prompt appears
2. Choose "Save as .user.md" — verify `.claude/skills/code-review/SKILL.user.md` contains your edits and `SKILL.md` has upstream content
3. Apply m1l1, then `10x get m1l2` — verify `[removed]` lines for artifacts exclusive to m1l1
4. Pipe output: `10x get m1l1 2>/dev/null | jq .` — verify JSON includes `removals` and conflict actions
5. Run with `--dry-run` — verify conflicts are detected but no files are written or backed up

## Performance Considerations

SHA-256 hashing of text files is negligible — a typical skill file is <10KB, and `createHash("sha256")` processes that in microseconds. The main performance concern is the interactive prompt blocking the apply flow, which is by design (user must make a decision). Non-TTY mode has zero overhead since the resolver returns `"skip"` synchronously.

## Migration Notes

- **Manifest v2 → v3**: Automatic on first `10x get` after upgrading. The v2 manifest is read successfully (backward compat in `isManifest()`), and the new v3 manifest with hashes is written at the end of apply. No manual migration needed.
- **First-run calibration**: Users upgrading from v2 may see conflict prompts for files they didn't edit (legitimate upstream changes with no stored baseline). A one-time `p.note()` explains this. Choosing "overwrite" or "apply to all → overwrite" resolves it quickly.
- **`applyBundle()` becomes async**: Any code calling `applyBundle()` must `await` it. Currently only `get.ts:154` calls it — low blast radius. Tests need the same treatment.

## References

- Frame brief: `context/changes/user-edit-protection/frame.md`
- Parent research: `context/changes/content-overwrite/research.md`
- Writer core: `src/lib/writer.ts:237-246` (computeFileAction), `src/lib/writer.ts:192-202` (silent removal)
- Manifest types: `src/lib/manifest.ts:19-42`
- Hash precedent: `src/lib/signing.ts:68-70` (sha256Hex)
- Prompt precedent: `src/lib/tool-prompt.ts:74-82` (select pattern), `tests/helpers/clack-mock.ts` (test mock)
- moveIfSafe precedent: `src/lib/tool-switch.ts:212-273`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Manifest v3 Schema + Hash Utility

#### Automated

- [x] 1.1 Type checking passes: `bun run typecheck` — ed64a98
- [x] 1.2 Linting passes: `bun run lint` — ed64a98
- [x] 1.3 Existing manifest tests pass: `bun test tests/manifest.test.ts` — ed64a98
- [x] 1.4 Existing writer tests pass: `bun test tests/writer.test.ts` — ed64a98

#### Manual

- [ ] 1.5 Manifest on disk contains `manifestVersion: 3` and hash fields after apply
- [ ] 1.6 Existing v2 manifest reads without crash

### Phase 2: Writer Three-Way Detection + Removal Tracking

#### Automated

- [x] 2.1 Type checking passes: `bun run typecheck` — 536ccf6
- [x] 2.2 Linting passes: `bun run lint` — 536ccf6
- [x] 2.3 All writer tests updated for async and pass: `bun test tests/writer.test.ts` — 536ccf6
- [x] 2.4 Build succeeds: `bun run build` — 536ccf6

#### Manual

- [ ] 2.5 Conflict callback invoked when user-edited file detected
- [ ] 2.6 `WriteResult.removals` populated on lesson transition
- [ ] 2.7 Manifest contains content hashes after clean apply

### Phase 3: Interactive Prompts + Output Rendering

#### Automated

- [x] 3.1 Type checking passes: `bun run typecheck` — 802ea46
- [x] 3.2 Linting passes: `bun run lint` — 802ea46
- [x] 3.3 All tests pass: `bun test` — 802ea46
- [x] 3.4 Build succeeds: `bun run build` — 802ea46
- [x] 3.5 Binary build succeeds: `bun run build:binary` — 802ea46

#### Manual

- [ ] 3.6 TTY conflict prompt appears with 4 options
- [ ] 3.7 Each resolution option produces correct behavior
- [ ] 3.8 Apply-to-all resolves subsequent conflicts without prompting
- [ ] 3.9 Non-TTY mode skips conflicts silently
- [ ] 3.10 `[removed]` lines appear in human output
- [ ] 3.11 JSON output includes removals and conflict actions

### Phase 4: Tests

#### Automated

- [x] 4.1 All tests pass: `bun test`
- [x] 4.2 Type checking passes: `bun run typecheck`
- [x] 4.3 Full CI pipeline passes

#### Manual

- [ ] 4.4 All three-way detection branches exercised in tests
- [ ] 4.5 No existing test broken or weakened
