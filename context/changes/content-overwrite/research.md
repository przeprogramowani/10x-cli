---
date: "2026-05-27T12:00:00+02:00"
researcher: Claude
git_commit: b9d404c38ac2320fe4f50e0338f374c196d60390
branch: master
repository: przeprogramowani/10x-cli
topic: "Content overwrite: get command deletes prompts and overwrites user-modified skills between lessons"
tags: [research, codebase, get-command, writer, manifest, reconciliation, file-deletion]
status: complete
last_updated: "2026-05-27"
last_updated_by: Claude
---

# Research: Content overwrite — get command deletes prompts and overwrites user-modified skills

**Date**: 2026-05-27T12:00:00+02:00
**Researcher**: Claude
**Git Commit**: b9d404c38ac2320fe4f50e0338f374c196d60390
**Branch**: master
**Repository**: przeprogramowani/10x-cli

## Research Question

Users report two problems with the `get` command:
1. Prompt files from a previous lesson (e.g. `skill-explainer.md`) disappear when a new lesson is fetched
2. Skills that users modified locally get silently overwritten when a new lesson or updated lesson is fetched

## Summary

Both issues stem from the `get` command's manifest-based reconciliation system in `src/lib/writer.ts`. The system is designed as **"one lesson at a time"** — each `get` replaces the full set of artifacts from the previous lesson with the current one. Files that existed in the old manifest but are absent from the new bundle are deleted. Files that exist locally but differ from the API content are overwritten without warning. This is **intentional design** (confirmed by test coverage), but it creates a poor user experience for cumulative course progression and skill customization.

## Detailed Findings

### 1. The Manifest System — Single Source of Truth for Cleanup

The CLI stores a manifest at `<toolProfileDir>/.10x-cli-manifest.json` (e.g., `.github/.10x-cli-manifest.json` for Copilot users) after each successful `get`.

**Manifest structure** (`src/lib/manifest.ts:24-41`):

```typescript
interface CliManifest {
  package: "@przeprogramowani/10x-cli"
  version: string
  manifestVersion: 2
  lastApplied: string          // ISO-8601 timestamp
  lessonId: string             // e.g., "m1l2" — SINGLE lesson, not an array
  course: string
  tool?: string
  files: {
    skills: Record<string, { files: string[] }>
    prompts: string[]
    configs: string[]
  }
}
```

The critical detail: **`lessonId` is a single string**, not an array. The manifest records what ONE lesson wrote, with no concept of accumulated state across lessons.

### 2. The Cleanup Step — Root Cause of Bug #1 (Disappearing Prompts)

After writing new artifacts, `applyBundle()` runs a cleanup phase (`src/lib/writer.ts:192-202`):

```typescript
if (!dryRun && !partial) {
    const removed = computeRemovals(prevManifest, bundle, profile, projectRoot);
    for (const entry of removed.skillDirs) rmSync(entry.path, { recursive: true, force: true });
    for (const entry of removed.skillFiles) {
      rmSync(entry.path, { force: true });
      removeEmptyParentDirs(entry.path, entry.skillDirAbs);
    }
    for (const entry of removed.prompts) rmSync(entry.path, { force: true });
    for (const entry of removed.configs) rmSync(entry.path, { force: true });
}
```

`computeRemovals()` (`src/lib/writer.ts:269-337`) compares the **previous manifest** against the **current bundle**:

- For each prompt in the old manifest: if the filename is NOT in the new bundle's prompt list → **delete it**
- For each skill in the old manifest: if the skill name is NOT in the new bundle → **delete the entire skill directory**
- For each skill file: if the file path is NOT in the new bundle's skill → **delete it**

**Concrete example from the bug report:**
1. User runs `10x get m1l2` → bundle includes prompt `skill-explainer.md` → manifest records `prompts: ["skill-explainer.md"]`
2. User runs `10x get m2l1` → bundle does NOT include `skill-explainer.md` → `computeRemovals()` flags it → `rmSync` deletes it

**The deletion is silent** — `WriteResult` tracks what was written, but removed files are not surfaced in the output or logged. The user sees no `[removed]` line.

### 3. The Overwrite Step — Root Cause of Bug #2 (User Modifications Lost)

`computeFileAction()` (`src/lib/writer.ts:237-246`) determines file status:

```typescript
function computeFileAction(filePath: string, newContent: string): ArtifactAction {
  if (!existsSync(filePath)) return "created";
  let current: string;
  try { current = readFileSync(filePath, "utf8"); } catch { return "updated"; }
  return current === newContent ? "unchanged" : "updated";
}
```

When a file exists but content differs, the action is `"updated"` — and the caller at `writer.ts:135-137` unconditionally overwrites with the new content. There is:

- **No three-way diff** — the system cannot distinguish "API updated upstream" from "user edited locally"
- **No backup** — the old content is not saved to a `.bak` or `.orig` file
- **No user confirmation** — no interactive prompt asking whether to overwrite
- **No hash of the "original" API content** — the manifest stores filenames but not content hashes, so there's no way to tell if the user changed the file vs. the API changed it

**Contrast with other artifact types:**
- **Configs** use skip-on-exists semantics (`writer.ts:185`): if the file already exists, it's `skipped` regardless of content
- **Rules** use sentinel markers: only the `<!-- BEGIN ... -->` / `<!-- END ... -->` block is replaced; user content outside is preserved

### 4. The Partial Apply Safety Valve

When `--type` or `--name` flags are passed to `get`, `partial` is set to `true` (`src/commands/get.ts:157`). In partial mode:
- Cleanup is **entirely skipped** (`writer.ts:193`: `if (!dryRun && !partial)`)
- Manifest is **not updated** (`writer.ts:205`)

This prevents filtered fetches from accidentally deleting artifacts of other types. However, users running normal `get` without filters always trigger cleanup.

### 5. Test Coverage Confirms Intentional Design

`tests/writer.test.ts:226-264` ("removes artifacts exclusive to the previous lesson") explicitly tests and asserts the cleanup behavior. The test:
1. Applies a bundle with `prompt-a.md`
2. Applies a second bundle with `prompt-b.md` (no `prompt-a.md`)
3. Asserts `prompt-a.md` was deleted from disk

This means the behavior is by design, not a regression.

### 6. API Response Does Not Distinguish "New" vs "Carried Over"

The API returns a flat `LessonBundle` (`src/lib/api-content.ts:83-93`):

```typescript
interface LessonBundle {
  lessonId: string
  module: number; lesson: number
  title: string; summary: string
  skills: SkillBundle[]
  prompts: BundleArtifact[]
  rules: BundleArtifact[]
  configs: BundleArtifact[]
}
```

Each bundle is a complete, self-contained set for ONE lesson. There is no metadata indicating which artifacts are new, which are shared across lessons, or which are being "carried forward." The CLI must do all reconciliation locally.

## Code References

- `src/commands/get.ts:40-164` — `get` command registration and `runGet()` flow
- `src/lib/writer.ts:103-231` — `applyBundle()` — the full apply + cleanup flow
- `src/lib/writer.ts:237-246` — `computeFileAction()` — the create/update/unchanged decision
- `src/lib/writer.ts:269-337` — `computeRemovals()` — the manifest diff that decides what to delete
- `src/lib/writer.ts:192-202` — the actual `rmSync` calls that delete files
- `src/lib/writer.ts:345-356` — `removeEmptyParentDirs()` — cleanup of empty dirs
- `src/lib/manifest.ts:24-41` — `CliManifest` type (single `lessonId`, not cumulative)
- `src/lib/manifest.ts:50-67` — `readManifest()` — null-safe reader
- `src/lib/manifest.ts:73-82` — `writeManifest()` — atomic write
- `src/lib/api-content.ts:64-98` — `LessonBundle`, `SkillBundle`, `BundleArtifact` types
- `src/lib/api-content.ts:138-195` — `fetchLesson()` — API call with signature verification
- `src/lib/tool-profile.ts:26-111` — tool profile path layouts
- `src/lib/sentinel-migration.ts:91-130` — `applyRulesBlockWithMarkers()` — rules are the only safe-merge artifact
- `src/lib/tool-switch.ts:212-273` — `moveIfSafe()` — the only place that checks content before overwriting (used in tool migration, not in lesson apply)
- `tests/writer.test.ts:226-264` — test confirming cleanup is intentional

## Architecture Insights

### Design Philosophy: Replace, Don't Accumulate

The system was designed for a **replace-all** model: each `get` is authoritative for the full set of artifacts the user should have. This works well for:
- Re-fetching the same lesson (idempotent)
- Tool profile migration (move artifacts between `.github/` ↔ `.claude/` ↔ `.cursor/`)

But it fails for:
- **Course progression** — lesson N+1 drops artifacts from lesson N that users still need
- **User customization** — any local edits are silently overwritten with upstream content

### The Safety Spectrum Across Artifact Types

| Artifact | Write behavior | Cleanup behavior | User edits protected? |
|----------|---------------|------------------|-----------------------|
| Skills   | Overwrite if different | Delete if absent from new bundle | **No** |
| Prompts  | Overwrite if different | Delete if absent from new bundle | **No** |
| Rules    | Sentinel-scoped replace | Sentinel block replaced, rest preserved | **Partially** (outside sentinels only) |
| Configs  | Skip if exists | Delete if absent from new bundle | **Yes** (skip-on-exists) |

### Interesting Precedent: `moveIfSafe()` in Tool Migration

`src/lib/tool-switch.ts:212-273` has `moveIfSafe()` which refuses to overwrite a file with different content during tool migration. It compares content and returns `false` if the destination already has different content. This exact pattern could be adapted for the lesson apply flow — the codebase already has the concept of "don't clobber user content."

## Open Questions

1. **Should the manifest track cumulative state across lessons?** Making `lessonId` an array and `files` a union of all applied lessons would prevent cleanup from removing prior-lesson artifacts. But this changes the mental model significantly.

Decision: I think it should, so we dont have to perform this weird ...previousLessonsSkills, ...previosLessonPrompts in /Users/admin/code/10x-toolkit/ - lets analyse this first. I think we should create a separate change for bug #1 and bug #2.

2. **Should `computeFileAction` grow a three-way merge?** The manifest could store content hashes (the API already sends `contentHash`). If local content differs from both the old hash and new content, it's a user edit → prompt for action. If it matches the old hash but differs from new content, it's a clean upstream update.

Decision: I think that we should implement three-way merge.

3. **What about the `contentHash` field?** The API already sends `contentHash` in the response schema (`src/generated/api-types.ts:116,122,128,134`) but the CLI ignores it. This field could be stored in the manifest to enable three-way conflict detection.

Decision: lets store this in the manifest to enable three-way conflict detection.

4. **Should removed files be logged?** Currently deletions are silent. At minimum, the `WriteResult` should surface `[removed]` entries so users can see what was cleaned up.

Decison: Yes, lets log removed files in the output.

5. **Should the `--keep` flag exist?** A `--keep` or `--no-cleanup` flag would let users opt out of the removal step, accumulating artifacts across lessons. This is the simplest fix for bug #1.

Decision: Nope, we dont need this.

6. **Filip's suggestion: detect user edits and prompt before overwriting.** The manifest could store content hashes of what the CLI wrote. On next apply, if local content differs from the stored hash, the user modified it → prompt: overwrite, skip, or save as `.user.md`?

Decision: Great idea, if we detect a hash drift lets prompt: overwrite, save previous file as .user.md or skip.
