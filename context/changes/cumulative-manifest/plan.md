# Cumulative Manifest Implementation Plan

## Overview

Make the CLI accumulate artifacts across lessons instead of replacing them. Each `10x get` records per-lesson file ownership in a `lessons` record on the manifest. `computeRemovals()` is scoped to the current lesson — files claimed by other lessons are protected from deletion. The `files` field becomes a union of all lesson entries, preserving backward compatibility for hash lookups, tool migration, and orphan detection.

## Current State Analysis

The manifest (v3) tracks a single `lessonId` and a flat `files` record. `computeRemovals()` diffs the entire previous manifest against the new bundle and deletes anything absent. This means `10x get m1l2` after `10x get m1l1` removes m1l1-exclusive artifacts. The `[removed]` lines from user-edit-protection make this visible but the behavior is still destructive.

The course-content repo works around this with a fragile spread pattern (`[...previousLesson.artifacts.root.skills]`), which is error-prone and the root cause of the prompt-deletion bug reported by users.

### Key Discoveries:

- `computeRemovals()` at `writer.ts:423-491` operates on the entire `prevManifest.files` — no lesson scoping
- Manifest building at `writer.ts:333-354` creates a fresh manifest from only the current bundle — no merging with previous state
- Content hashes in `files.skills[name].contentHashes` and `files.promptHashes` are per-physical-file and orthogonal to lesson ownership — conflict detection reads from these and needs no changes
- `tool-switch.ts` migrates all files in `manifest.files` — benefits from the union containing everything
- `findOrphanedManifests()` reads the flat `files` field — union is backward compatible

## Desired End State

After this change:

1. Running `10x get m1l1` then `10x get m1l2` accumulates both lessons' artifacts. m1l1-exclusive skills, prompts, and configs remain on disk.
2. Re-applying `10x get m1l1` scopes removal to m1l1 only — files owned by m1l2 are protected.
3. If m1l1 drops a skill that no other lesson claims, it's removed. If m1l2 also claims it, it's preserved.
4. The manifest's `files` field is a union of all lesson entries — everything that should be on disk is listed. Hash lookups, tool migration, and orphan detection work unchanged.
5. Upgrading from v2 (or v3-without-`lessons`) seeds the `lessons` record from the previous manifest's data so existing artifacts aren't orphaned.

**Verification**: Apply bundleA (m1l1), then bundleB (m1l2), then bundleA again. After all three applies, both lessons' exclusive artifacts exist on disk. Only files dropped from a specific lesson AND not claimed by any other lesson are removed.

## What We're NOT Doing

- No `10x clean` command for pruning stale lesson entries (future work)
- No changes to the API or bundle format — this is CLI-only
- No changes to conflict detection, hash storage, or the `ConflictResolver` callback — they're orthogonal
- No changes to `get.ts`, `conflict-prompt.ts`, or output rendering — they consume `WriteResult` which stays the same shape
- No removal of the spread pattern in course-content — that's a separate change after this ships

## Implementation Approach

Add a `lessons` record to the manifest that tracks per-lesson file ownership (skills, prompts, configs) with an `appliedAt` timestamp. Rewrite `computeRemovals()` to scope removal to the current lesson's previous entry, building a "protected set" from all other lessons' entries. Rebuild `files` as the union of all lesson entries on each apply, with content hashes merged (current bundle wins, others preserved from previous manifest).

## Critical Implementation Details

### Hash merging during union rebuild

Content hashes live in `files` (the union), not in per-lesson entries. When rebuilding `files`:
- For skills/prompts in the **current bundle**: use `nextSkillHashes` / `nextPromptHashes` (freshly computed during the write loop)
- For skills/prompts from **other lessons** (not in current bundle): preserve hashes from `prevManifest.files.skills[name].contentHashes` / `prevManifest.files.promptHashes`
- Current bundle's hashes overwrite previous ones for the same file path — this is correct since the current bundle's content was just written to disk

### v2/v3-without-lessons upgrade seeding

When `prevManifest` exists but has no `lessons` field, seed the record from `prevManifest.lessonId` + `prevManifest.files`. Without this, the old lesson's artifacts persist on disk but aren't tracked in any lesson entry — making them invisible to scoped removal and union rebuild.

---

## Phase 1: Manifest Schema Extension

### Overview

Add the `LessonFilesEntry` type and `lessons` field to the manifest, update validation to accept it, and add a helper to build the union `files` from lesson entries. This phase is type-level + validation only — the writer doesn't use the new field yet.

### Changes Required:

#### 1. LessonFilesEntry type and lessons field

**File**: `src/lib/manifest.ts`

**Intent**: Add a `LessonFilesEntry` interface for per-lesson file ownership (no hashes — those stay in the union `files`). Add `lessons?: Record<string, LessonFilesEntry>` to `CliManifest`. The field is optional so v2 manifests and v3-without-lessons manifests remain valid.

**Contract**: `LessonFilesEntry` has `appliedAt: string`, `skills: Record<string, { files: string[] }>`, `prompts: string[]`, `configs: string[]`. The `lessons` field is optional on `CliManifest`.

#### 2. isManifest() validation update

**File**: `src/lib/manifest.ts`

**Intent**: Update `isManifest()` to validate the `lessons` field when present. If absent, the manifest is still valid (backward compat). If present, each entry must have the expected shape.

**Contract**: Add an `isLessonsRecord()` helper that validates `Record<string, LessonFilesEntry>`. `isManifest()` returns true when `lessons` is absent OR passes `isLessonsRecord()`.

#### 3. buildUnionFiles helper

**File**: `src/lib/manifest.ts`

**Intent**: Add a pure function that takes a `lessons` record and returns the union `files` structure (skills, prompts, configs — without hashes, since those are applied by the caller from the write loop).

**Contract**: `buildUnionFiles(lessons: Record<string, LessonFilesEntry>): { skills: Record<string, { files: string[] }>; prompts: string[]; configs: string[] }`. Exported for use by writer.ts. Union deduplicates file paths within skills and deduplicates prompt/config names.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `bun run typecheck`
- Linting passes: `bun run lint`
- Existing manifest tests pass unchanged: `bun test tests/manifest.test.ts`
- New tests pass: `isManifest()` accepts a manifest with valid `lessons` field, rejects malformed `lessons`, accepts a manifest without `lessons` (backward compat)
- New tests pass: `buildUnionFiles()` correctly unions multiple lesson entries, deduplicates file paths and prompt/config names

#### Manual Verification:

- Review the `LessonFilesEntry` interface — confirm it has no hashes (hashes stay in `files`)
- Review `isManifest()` — confirm it doesn't reject existing v2 or v3 manifests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Cumulative Writer Logic

### Overview

Rewrite `computeRemovals()` for lesson-scoped removal with a protected set. Update the manifest building block to merge lesson entries, rebuild `files` as union, merge content hashes, and seed from v2 manifests. Update existing tests and add new behavior tests.

### Changes Required:

#### 1. Rewrite computeRemovals() for lesson-scoped removal

**File**: `src/lib/writer.ts`

**Intent**: Scope removal to the current lesson's previous entry. Build a "protected set" from all other lessons' entries. Only remove files that (a) were in this lesson's previous entry, (b) are NOT in the new bundle, and (c) are NOT claimed by any other lesson.

**Contract**: Function signature stays `computeRemovals(prevManifest, bundle, profile, projectRoot): RemovalPlan`. New behavior:
- Returns empty when `prevManifest` is null or has no `lessons` field
- Returns empty when `prevManifest.lessons[bundle.lessonId]` is absent (first time applying this lesson)
- For skills dropped from this lesson: if another lesson claims the skill, remove only unprotected individual files (not the whole dir). If no other lesson claims it, remove the whole dir
- For prompts/configs: skip if protected by another lesson

#### 2. Update manifest building block for cumulative merge

**File**: `src/lib/writer.ts`

**Intent**: Replace the current "build from current bundle only" block with: (1) construct a `LessonFilesEntry` for the current bundle, (2) merge into existing `lessons` record (seeding from `prevManifest` if no `lessons` field exists), (3) rebuild `files` as union via `buildUnionFiles()`, (4) apply content hashes — current bundle's hashes win, others preserved from `prevManifest.files`.

**Contract**: The `nextManifest` object gains a `lessons` field. `files` is rebuilt from `buildUnionFiles()` + hash merging. `lessonId` still set to `bundle.lessonId` (last applied). The seeding path creates a lesson entry from `prevManifest.lessonId` + `prevManifest.files` when `prevManifest.lessons` is absent.

#### 3. Update existing "cleanup on re-apply" tests

**File**: `tests/writer.test.ts`

**Intent**: The test "removes artifacts exclusive to the previous lesson" (`writer.test.ts:226`) currently expects cross-lesson removal (applying bundleB removes bundleA's exclusive artifacts). With cumulative behavior, bundleA's artifacts should PERSIST. Update assertions accordingly. Similarly update "manifest reflects the most recently applied lesson" (`writer.test.ts:254`) — `files.skills` should now be the union of both lessons.

**Contract**: After applying bundleA then bundleB: `code-review` skill and `plan` prompt still exist on disk. Manifest `files.skills` contains `code-review`, `tdd`, and `refactor`. Manifest `files.prompts` contains both `plan.md` and `implement.md`. Manifest has `lessons.m1l1` and `lessons.m1l2` entries.

#### 4. Update removal tracking tests

**File**: `tests/writer.test.ts`

**Intent**: "reports removed skills when transitioning between lessons" (`writer.test.ts:791`) and "reports removed prompts when transitioning between lessons" (`writer.test.ts:802`) currently expect removals when switching lessons. With cumulative behavior, no removals should occur (different lessons don't remove each other's files). Update assertions to expect empty removals. Similarly update "dry-run populates removals without deleting files" (`writer.test.ts:821`).

**Contract**: Applying bundleB after bundleA produces zero removals. Dry-run of the same produces zero removals.

#### 5. Update the "removes a file dropped from a retained skill on re-apply" test

**File**: `tests/writer.test.ts`

**Intent**: This test (`writer.test.ts:334`) applies a multi-file bundle then a trimmed version of the same lesson. The file dropped from the skill should still be removed — this is intra-lesson cleanup, not cross-lesson. Verify the test still passes with the new scoped logic (the re-apply uses the same `lessonId`, so `computeRemovals()` scopes to that lesson's previous entry).

**Contract**: Same behavior as today — the dropped file is removed because it's within the same lesson scope and no other lesson claims it.

#### 6. Add new cumulative behavior tests

**File**: `tests/writer.test.ts`

**Intent**: Add a new `describe("writer — cumulative multi-lesson")` block covering:
- Apply m1l1 then m1l2: both lessons' artifacts exist, manifest has both `lessons` entries, `files` is the union
- Re-apply m1l1 after m1l2: m1l2-exclusive artifacts are in the protected set and NOT removed
- Lesson drops a skill not claimed by any other lesson: skill IS removed (scoped cleanup works)
- Lesson drops a skill that another lesson claims: skill is NOT removed
- Union `files` includes content hashes from both lessons (current bundle's hashes win for shared skills)
- `appliedAt` timestamps are present in lesson entries

**Contract**: At least 4-6 new test cases covering the scenarios above.

#### 7. Add v2/v3 upgrade seeding tests

**File**: `tests/writer.test.ts`

**Intent**: Test the upgrade path from v2 and v3-without-`lessons` manifests. After the first apply with the new code: `lessons` is populated (including the seeded entry from the old manifest), `files` is the union, and subsequent applies scope correctly.

**Contract**: At least 2 new test cases: v2 upgrade seeds `lessons` from old data; v3-without-`lessons` upgrade seeds `lessons`.

#### 8. Update writer-profiles cleanup test

**File**: `tests/writer-profiles.test.ts`

**Intent**: The "removes stale artifacts using profile paths when lesson changes" test (`writer-profiles.test.ts:179`) expects cross-lesson removal with a specific profile. Update to expect cumulative behavior (no removal when switching lessons).

**Contract**: After applying bundleA then bundleB with a cursor profile, bundleA-exclusive artifacts persist.

#### 9. Update CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Update the "Writer & conflict detection" section to document cumulative behavior, the `lessons` record, scoped removal, and union `files` rebuild.

**Contract**: The CLAUDE.md section accurately describes the new manifest shape and removal semantics.

### Success Criteria:

#### Automated Verification:

- All tests pass: `bun test`
- Type checking passes: `bun run typecheck`
- Linting passes: `bun run lint`
- Build succeeds: `bun run build`

#### Manual Verification:

- Review `computeRemovals()` rewrite — confirm protected-set logic is correct for all scenarios (cross-lesson, intra-lesson, shared skill with partial file overlap)
- Review manifest building — confirm hash merging: current bundle wins, others preserved
- Review v2 seeding — confirm old lesson's files are tracked in the seeded `lessons` entry
- Verify test coverage matches the key scenario from the research: apply m1l1 → apply m1l2 → re-apply m1l1, all artifacts present, no cross-lesson deletion

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `isManifest()` accepts/rejects manifests with/without `lessons` field
- `buildUnionFiles()` unions multiple lesson entries correctly, deduplicates
- `computeRemovals()` returns empty for null manifest, missing `lessons`, first-time lesson
- `computeRemovals()` scopes to current lesson — doesn't remove other lessons' files
- `computeRemovals()` removes files dropped from current lesson when unprotected
- `computeRemovals()` protects files claimed by other lessons (protected set)

### Integration Tests:

- Full apply cycle: bundleA → bundleB → bundleA — all artifacts present, no cross-lesson deletion
- Intra-lesson file drop: apply multi-file skill, re-apply with file removed — file deleted
- Shared skill between lessons: both lessons write `10x-init`, re-apply one — files persist
- v2 upgrade: seed from old manifest, subsequent apply scopes correctly
- Manifest `files` is union: all lessons' skills/prompts/configs appear
- Content hashes: current bundle's hashes win, other lessons' hashes preserved

### Manual Testing Steps:

1. Build the CLI (`bun run build`) and apply two different lessons to a test project
2. Verify both lessons' artifacts exist after the second apply
3. Re-apply the first lesson — verify second lesson's artifacts are not removed
4. Check the manifest JSON — verify `lessons` record has both entries, `files` is the union

## Performance Considerations

Manifest size grows linearly with lessons applied. For a course with 20 lessons, the manifest adds ~5-10KB for lesson entries. `buildUnionFiles()` iterates all entries on each apply — O(total files across all lessons), negligible for the expected scale.

The protected-set computation in `computeRemovals()` is O(files in other lessons) — same scale. No caching needed.

## References

- Frame brief: `context/changes/cumulative-manifest/frame.md`
- Research doc: `context/changes/cumulative-manifest/research.md`
- Parent research: `context/changes/content-overwrite/research.md`
- Writer core: `src/lib/writer.ts` — `computeRemovals()` at line 423, manifest building at line 333
- Manifest types: `src/lib/manifest.ts`
- Writer tests: `tests/writer.test.ts` — cleanup tests at line 225, removal tracking at line 790
- Profile tests: `tests/writer-profiles.test.ts` — cleanup test at line 179
- User-edit-protection commits: ed64a98..134388a

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Manifest Schema Extension

#### Automated

- [x] 1.1 Type checking passes: `bun run typecheck`
- [x] 1.2 Linting passes: `bun run lint`
- [x] 1.3 Existing manifest tests pass unchanged: `bun test tests/manifest.test.ts`
- [x] 1.4 New tests: isManifest() validates lessons field correctly
- [x] 1.5 New tests: buildUnionFiles() unions and deduplicates correctly

#### Manual

- [ ] 1.6 Review LessonFilesEntry interface — no hashes in per-lesson entries
- [ ] 1.7 Review isManifest() — doesn't reject v2 or v3 manifests

### Phase 2: Cumulative Writer Logic

#### Automated

- [ ] 2.1 All tests pass: `bun test`
- [ ] 2.2 Type checking passes: `bun run typecheck`
- [ ] 2.3 Linting passes: `bun run lint`
- [ ] 2.4 Build succeeds: `bun run build`

#### Manual

- [ ] 2.5 Review computeRemovals() — protected-set logic correct for all scenarios
- [ ] 2.6 Review manifest building — hash merging correct (current wins, others preserved)
- [ ] 2.7 Review v2 seeding — old lesson's files tracked in seeded entry
- [ ] 2.8 Test coverage matches key scenario: apply m1l1 → m1l2 → m1l1, all artifacts present
