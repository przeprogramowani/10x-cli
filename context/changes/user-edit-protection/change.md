---
change_id: user-edit-protection
title: Detect user-modified files and prompt before overwriting
status: implemented
created: 2026-05-27
updated: 2026-05-27
archived_at: null
---

## Notes

Split from [content-overwrite](../content-overwrite/research.md) — Bug #2 (user-modified skills silently overwritten).

Currently `computeFileAction()` does a plain string compare and overwrites if content differs. No way to distinguish "API updated upstream" from "user edited locally." Also, file removals are silent — no `[removed]` line in output.

**Goal**: Three-way conflict detection using content hashes, user-facing prompts on conflict, and visible removal logging.

**Key decisions from research (see [content-overwrite/research.md](../content-overwrite/research.md) — Open Questions #2, #3, #4, #6)**:
- Store `contentHash` in the manifest when writing files (API already sends it, CLI ignores it)
- Three-way compare on next apply: manifest hash vs local content vs new bundle content
- If local differs from manifest hash → user edited → prompt: **overwrite** / **save as `.user.md`** / **skip**
- Surface `[removed]` entries in `WriteResult` and render them in output so deletions are visible
- Precedent: `moveIfSafe()` in `tool-switch.ts` already refuses to clobber files with different content — same concept applied to lesson writes
