# Cumulative Manifest — Plan Brief

> Full plan: `context/changes/cumulative-manifest/plan.md`
> Frame brief: `context/changes/cumulative-manifest/frame.md`
> Research: `context/changes/cumulative-manifest/research.md`

## What & Why

The manifest's single-lesson design causes cross-lesson artifact deletion — running `10x get m1l2` after `m1l1` removes m1l1-exclusive skills and prompts. The course-content repo works around this with a fragile spread pattern that's the root cause of the prompt-deletion bug reported by users. We're adding per-lesson file ownership to the manifest so the CLI accumulates artifacts across lessons and only removes files within the scope of the current lesson.

## Starting Point

Manifest v3 has `lessonId: string` (single lesson) and `files: {...}` (flat record). `computeRemovals()` diffs the entire previous manifest against the new bundle. User-edit-protection (conflict detection, content hashes, `[removed]` lines) is already on master but unreleased — this change folds into v3 before release.

## Desired End State

Users can `10x get` any lesson in any order. All previously-fetched artifacts remain on disk. Re-applying a lesson only removes files that (a) that specific lesson previously wrote, (b) the new bundle no longer includes, and (c) no other lesson claims. The spread pattern in course-content becomes unnecessary.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Per-lesson vs accumulate-only | Per-lesson ownership (`lessons` record) | Single release — no v3/v4 split; per-lesson scoping handles intra-lesson file drops correctly. | Plan |
| Schema for applied lessons | `lessons` record only (no separate `appliedLessons[]`) | `Object.keys(lessons)` gives the same list — single source of truth, no sync risk. | Plan |
| Stale file handling | Auto-remove (scoped to current lesson + protected set) | Matches user expectation that re-fetch is authoritative for that lesson; prevents ghost files. | Plan |
| Lesson entry timestamps | Keep `appliedAt` per entry | Cheap diagnostic info for "when did I last fetch m1l2?", future-proofs `10x status`. | Plan |
| Hash storage location | Stays in union `files`, not per-lesson | Hashes are per-physical-file (disk state), not per-lesson; conflict detection reads from `files` unchanged. | Research |
| v2 upgrade path | Seed `lessons` from `prevManifest.lessonId` + `prevManifest.files` | Prevents orphaning old lesson's artifacts on first cumulative apply. | Plan |

## Scope

**In scope:**
- `LessonFilesEntry` type + `lessons?` field on `CliManifest`
- `isManifest()` validation for `lessons`
- `buildUnionFiles()` helper
- Scoped `computeRemovals()` with protected set
- Union `files` rebuild + hash merging in manifest building block
- v2/v3-without-lessons upgrade seeding
- Test updates (existing cleanup/removal tests) + new cumulative behavior tests
- CLAUDE.md documentation update

**Out of scope:**
- `10x clean` command for pruning stale lesson entries
- Changes to API, bundle format, `get.ts`, `conflict-prompt.ts`, or output rendering
- Removal of the spread pattern in course-content

## Architecture / Approach

The manifest gains a `lessons?: Record<string, LessonFilesEntry>` field where each key is a `lessonId` and the value tracks that lesson's skills, prompts, configs, and `appliedAt` timestamp. On each apply, the writer merges the new lesson entry into `lessons`, rebuilds `files` as the union of all entries (with content hashes merged — current bundle wins), and scopes removal to the current lesson's previous entry minus a "protected set" from other lessons.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Manifest Schema Extension | `LessonFilesEntry` type, `lessons?` field, validation, `buildUnionFiles()` helper | Low — type-level + validation only, no behavioral change |
| 2. Cumulative Writer Logic | Scoped `computeRemovals()`, union rebuild, hash merging, upgrade seeding, all tests | Medium — rewriting `computeRemovals()` and updating ~10 existing tests |

**Prerequisites:** User-edit-protection commits (ed64a98..134388a) already on master
**Estimated effort:** ~2 sessions across 2 phases

## Open Risks & Assumptions

- Manifest size grows linearly with lessons (~5-10KB for 20 lessons) — assumed negligible
- Stale lesson entries persist forever without a `10x clean` command — assumed harmless for now
- v2 upgrade seeding assumes `prevManifest.lessonId` + `prevManifest.files` accurately represent one lesson's files — true for the single-lesson model

## Success Criteria (Summary)

- Apply m1l1 → m1l2 → m1l1: all artifacts from both lessons exist on disk, no cross-lesson deletion
- Re-apply a lesson that drops a skill not claimed elsewhere: skill is removed (scoped cleanup works)
- All existing tests pass (updated for cumulative semantics) + new test coverage for multi-lesson scenarios
