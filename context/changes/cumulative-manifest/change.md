---
change_id: cumulative-manifest
title: Make the CLI accumulate artifacts across lessons instead of replacing
status: preparing
created: 2026-05-27
updated: 2026-05-27
archived_at: null
---

## Notes

Split from [content-overwrite](../content-overwrite/research.md) — Bug #1 (disappearing prompts/skills between lessons).

The CLI's manifest currently records a single `lessonId` and treats each `get` as a full replacement. `computeRemovals()` deletes anything in the old manifest absent from the new bundle. This forces the course-content repo to manually spread all prior-lesson artifacts (`[...previousLesson.artifacts.root.skills]`) — error-prone and the root cause of the prompt deletion bug.

**Goal**: Make the manifest cumulative so the CLI accumulates artifacts across lessons. This eliminates the need for the spread pattern in course-content and prevents artifact loss during course progression.

**Key decisions from research (see [content-overwrite/research.md](../content-overwrite/research.md) — Open Question #1)**:
- `lessonId` becomes an array (or the manifest tracks a union of all applied lessons' files)
- No `--keep` flag needed — accumulation is the default behavior
- The spread pattern in `10x-toolkit/packages/course-content` can be removed once this ships

**Decision (2026-05-27)**: Ship this as part of manifest v3 together with user-edit-protection, not as a separate v4. The user-edit-protection change has already landed on master (commits ed64a98..134388a) but has NOT been released yet. Fold cumulative tracking into v3 before the release so users never see the single-lesson removal behavior with the new `[removed]` lines.
