---
date: "2026-05-27"
researcher: Claude
topic: "Cumulative manifest: how to fold per-lesson tracking into manifest v3 alongside user-edit-protection"
tags: [research, manifest, cumulative, writer, cleanup, conflict-detection]
status: complete
---

# Research: Cumulative Manifest — Folding Into v3

## Context

The user-edit-protection change landed on master (commits ed64a98..134388a) introducing manifest v3 with:
- Per-file SHA-256 `contentHashes` on skills and `promptHashes` on prompts
- Three-way conflict detection in `computeFileAction()`
- `ConflictResolver` callback injection in async `applyBundle()`
- `WriteResult.removals` tracking + `[removed]` lines in output
- `isManifest()` accepts v2 and v3; v2→v3 upgrade triggers one-time conflict calibration

**Problem observed in manual testing**: Running `10x get m1l2` then `10x get m1l1` removes m1l2-exclusive skills (10x-tech-stack-selector, 10x-stack-assess) and prompts (skill-explainer.md). The `[removed]` lines now make this visible, but the behavior is still wrong — users expect lesson content to accumulate.

**Decision**: Ship cumulative tracking as part of v3 before release, not as a separate v4.

## Current Manifest v3 Shape (post user-edit-protection)

```typescript
interface CliManifest {
  package: "@przeprogramowani/10x-cli";
  version: string;
  manifestVersion: 2 | 3;
  lastApplied: string;
  lessonId: string;           // ← single lesson, root cause of the problem
  course: string;
  tool?: string;
  files: {
    skills: Record<string, {
      files: string[];
      contentHashes?: Record<string, string>;  // v3 addition
    }>;
    prompts: string[];
    configs: string[];
    promptHashes?: Record<string, string>;      // v3 addition
  };
}
```

`computeRemovals()` diffs `prevManifest.files` (everything the single previous lesson wrote) against the new bundle. Anything missing from the new bundle gets deleted.

## Proposed v3 Shape (cumulative + user-edit-protection)

```typescript
interface CliManifest {
  package: "@przeprogramowani/10x-cli";
  version: string;
  manifestVersion: 2 | 3;
  lastApplied: string;
  lessonId: string;           // last applied lesson (backward compat for display/logging)
  course: string;
  tool?: string;

  // Union of ALL applied lessons' files — backward compat for orphan detection,
  // tool migration, and anything that reads the flat file list.
  // Rebuilt each apply as the union of all lessons[*] entries.
  files: {
    skills: Record<string, {
      files: string[];
      contentHashes?: Record<string, string>;
    }>;
    prompts: string[];
    configs: string[];
    promptHashes?: Record<string, string>;
  };

  // NEW: Per-lesson ownership tracking. Each key is a lessonId (e.g. "m1l1").
  // computeRemovals() uses this to scope cleanup to the current lesson only.
  lessons?: Record<string, {
    appliedAt: string;
    skills: Record<string, { files: string[] }>;
    prompts: string[];
    configs: string[];
  }>;
}
```

### Why this shape

- **`files` stays as-is**: Backward compat for `findOrphanedManifests()`, `tool-switch.ts` migration, and any external tooling that reads the manifest. It's the union of all `lessons[*]` entries.
- **`contentHashes` stay in `files`**: They're per-physical-file (one hash per file on disk), not per-lesson. When m1l1 and m1l2 both write the same skill, the hash reflects whatever is currently on disk. No relocation needed — the conflict detection code in `applyBundle()` reads from `prevManifest.files.skills[name]?.contentHashes?.[path]` and this continues to work.
- **`lessons` is optional**: v2 manifests don't have it, v3 manifests written before this change don't have it. The upgrade path handles absence gracefully (see below).
- **`lessonId` stays as a string**: It's the LAST applied lesson. Used for display (`manifest.lessonId` in output) and backward compat. Not used for cleanup logic anymore.

## How computeRemovals() Changes

### Current logic (single-lesson)
```
previous lesson files  MINUS  new bundle files  =  files to remove
```

### New logic (cumulative)
```
THIS lesson's previous entry  MINUS  new bundle files  =  candidates
candidates  MINUS  files claimed by ANY other lesson  =  files to actually remove
```

Concretely:

1. Look up `prevManifest.lessons?.[bundle.lessonId]` — if absent, no previous state for this lesson, no removals.
2. Build a "protected set" from all OTHER lesson entries: `union(prevManifest.lessons[otherLessonId].skills/prompts/configs for otherLessonId ≠ bundle.lessonId)`.
3. For each file in this lesson's previous entry that is NOT in the new bundle AND NOT in the protected set → remove it.

### Key scenario that must work

1. `10x get m1l1` → writes m1l1 skills (10x-init, 10x-shape, 10x-prd). Manifest: `lessons.m1l1 = {skills: {10x-init, 10x-shape, 10x-prd}, prompts: [], ...}`
2. `10x get m1l2` → writes m1l2 skills (10x-init, 10x-shape, 10x-prd, 10x-tech-stack-selector, 10x-stack-assess) + prompt skill-explainer. Manifest: `lessons.m1l2 = {...}`, `lessons.m1l1` preserved.
3. `10x get m1l1` again (re-fetch) → updates m1l1 entry. m1l2-exclusive artifacts (10x-tech-stack-selector, 10x-stack-assess, skill-explainer) are in the protected set → NOT removed.
4. If m1l1's bundle no longer includes 10x-prd → 10x-prd is in m1l1's previous entry but NOT in the new bundle. Is it in the protected set (m1l2)? If yes → not removed. If no → removed.

## Interaction With User-Edit-Protection

| Feature | Impact | Changes needed |
|---------|--------|---------------|
| `contentHashes` in `files.skills[name]` | None — stays global, reflects disk state | None |
| `promptHashes` in `files` | None — stays global | None |
| `computeFileAction()` three-way detection | Reads from `prevManifest.files.skills[name]?.contentHashes?.[path]` — union field, works as-is | None |
| `ConflictResolver` callback | Fires on hash mismatch regardless of manifest shape | None |
| `WriteResult.removals` | Fewer removals now (lesson-scoped) — still works | None |
| `showUpgradeNotice()` in `get.ts` | Checks `prevManifest.manifestVersion === 2` — still valid | None |
| `[removed]` output rendering | Works unchanged, just fewer items | None |

**The conflict detection and hash storage are completely orthogonal to the cumulative tracking.** The only code that changes is `computeRemovals()` and the manifest-building block at the end of `applyBundle()`.

## Upgrade Paths

### v2 → v3 (no `lessons` field, no hashes)
- `isManifest()` already accepts v2
- No `lessons` field → treat as "no previous lesson state" → no lesson-scoped removals on first apply
- No `contentHashes` → conflict detection treats any diff as potential conflict (one-time calibration, already implemented)
- After first v3 apply: manifest gets both `lessons` and `contentHashes`

### v3 without `lessons` → v3 with `lessons` (manifests written by user-edit-protection before this change ships)
- This can only happen if someone uses the unreleased code on master
- `lessons` is optional in the type — absence is handled the same as v2 upgrade
- On first apply: `lessons` is populated, `files` is rebuilt as union

## Files That Need Changes

### `src/lib/manifest.ts`
- Add `LessonFilesEntry` interface (per-lesson file ownership, no hashes)
- Add optional `lessons?: Record<string, LessonFilesEntry>` to `CliManifest`
- `isManifest()` validation: `lessons` is optional, if present must be a record of valid entries
- Add helper: `allFilesFromLessons(lessons)` → builds the union `files` structure from all lesson entries

### `src/lib/writer.ts`
- **`computeRemovals()`**: Rewrite to scope to current lesson. Accept full manifest, read `lessons[bundle.lessonId]` for previous state, build protected set from other lessons.
- **Manifest building block** (end of `applyBundle()`): Merge new lesson entry into `prevManifest.lessons`, rebuild `files` as union, preserve `contentHashes`.
- **Hash lookup for conflict detection**: No change — reads from `prevManifest.files` which is the union.

### `src/commands/get.ts`
- No changes needed — it just passes options to `applyBundle()` and reads `WriteResult`.

### `src/lib/conflict-prompt.ts`
- No changes needed.

### Tests
- **`tests/writer.test.ts`**: Update "cleanup on re-apply" tests — applying bundleB after bundleA should NOT remove bundleA-exclusive artifacts. Add new tests for lesson-scoped cleanup.
- **`tests/manifest.test.ts`**: Add tests for `lessons` field validation, `allFilesFromLessons()` helper.
- **Existing conflict detection tests**: Should pass unchanged (they don't depend on cleanup behavior).

### `CLAUDE.md`
- Update the "Writer & conflict detection" section to document cumulative behavior.

## Risks

- **Manifest size growth**: Each applied lesson adds an entry. For a course with 20 lessons, the manifest could have 20 entries. Each entry is small (skill names + file paths, no content), so this is ~5-10KB max. Negligible.
- **Stale lesson entries**: If a lesson is removed from the course, its manifest entry persists forever. Not harmful — the files are just never cleaned up. A future `10x clean` command could prune stale entries.
- **Shared skill with different content across lessons**: m1l1 writes `10x-init/SKILL.md` v1, m1l2 writes `10x-init/SKILL.md` v2. The last-applied lesson wins on disk. The content hash in `files` reflects the last write. If the user then re-applies m1l1, the v1 content comes back and the hash updates. This is correct behavior — each apply is authoritative for its own lesson's content.

## References

- Parent research: `context/changes/content-overwrite/research.md`
- User-edit-protection plan: `context/changes/user-edit-protection/plan.md`
- User-edit-protection commits: ed64a98 (p1), 536ccf6 (p2), 802ea46 (p3), e0b122c (p4), 134388a (epilogue)
- Writer core: `src/lib/writer.ts` — `computeRemovals()` at line 423, manifest building at line 332
- Manifest types: `src/lib/manifest.ts`
- User report: `context/changes/content-overwrite/change.md` (Zbigniew Ciołak, Filip Korpet)
