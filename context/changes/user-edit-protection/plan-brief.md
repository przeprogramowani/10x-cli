# User-Edit Protection — Plan Brief

> Full plan: `context/changes/user-edit-protection/plan.md`
> Frame brief: `context/changes/user-edit-protection/frame.md`
> Research: `context/changes/content-overwrite/research.md`

## What & Why

The CLI's write path treats local files as a dumb cache — it has no mechanism to distinguish user modifications from upstream updates, because it doesn't track what it originally wrote. When `10x get` runs, locally-modified skills and prompts are silently overwritten, and file removals during lesson transitions are invisible.

## Starting Point

`computeFileAction()` in `writer.ts` does a binary same/different check and unconditionally overwrites. The manifest stores filenames but not content hashes. Removals happen via `rmSync` with no output. The `moveIfSafe()` function in `tool-switch.ts` has the concept of "don't clobber different content" but it's not applied to the lesson-apply path.

## Desired End State

User-modified skill and prompt files trigger an interactive per-file prompt (overwrite / save as `.user.<ext>` / skip / apply-to-all) before being overwritten. Non-TTY environments default to skip. File removals appear as `[removed]` lines in both human and JSON output. The manifest stores per-file SHA-256 hashes enabling accurate three-way detection.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Hash granularity | Per-file hashes computed locally | Fine-grained — editing one file in a multi-file skill doesn't block updates to others | Plan |
| Prompt UX | Per-file with "Apply to all" option | Granular control when wanted, fast bulk resolution when not | Plan |
| Non-TTY behavior | Default to skip (safe) | Never silently destroy user work in automated pipelines | Frame |
| v2 manifest upgrade | Compute hash from disk on first encounter | No blind window — conflicts detected immediately, one-time calibration cost | Plan |
| Removal visibility | `[removed]` lines in human output + JSON | Consistent with existing `[created]/[updated]/[unchanged]` pattern | Frame |

## Scope

**In scope:**
- Three-way conflict detection for skills and prompts using SHA-256 content hashes
- Interactive per-file conflict prompt with overwrite / save-as-user / skip / apply-to-all
- Non-TTY default to skip with `"conflict_skipped"` in JSON output
- `[removed]` entries in `WriteResult` and rendered output for lesson-transition deletions
- Manifest v3 schema with backward-compatible v2 reading
- v2 → v3 upgrade path with one-time calibration notice

**Out of scope:**
- Conflict detection for configs (skip-on-exists) or rules (sentinel markers)
- Protection against removing user-edited files (visual only, no prompt gate)
- Cumulative manifest tracking (separate change)
- `--force` flag to bypass prompts

## Architecture / Approach

The change layers cleanly: manifest schema first (data model), then writer logic (detection + resolution via injected callback), then UX layer (prompt module + output rendering). The `ConflictResolver` callback is injected via `ApplyOptions` so the writer has no dependency on `@clack/prompts` — the command layer wires the prompt, making the writer testable with simple mock resolvers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Manifest v3 + Hash Utility | Schema with per-file content hashes, v2 compat, `contentHash()` export | Low — additive schema change with optional fields |
| 2. Writer Three-Way Detection + Removal Tracking | Conflict detection, async `applyBundle()`, removal tracking, hash storage | Medium — `applyBundle()` becomes async, all callers and tests must adapt |
| 3. Interactive Prompts + Output Rendering | `@clack/prompts` conflict resolution, `[removed]` lines, JSON envelope updates | Medium — UX correctness requires manual testing across TTY/non-TTY |
| 4. Tests | Full test coverage for conflicts, removals, v2 upgrade, hash persistence | Low — test-only changes |

**Prerequisites:** None — all dependencies (`@clack/prompts`, `node:crypto`) are already available
**Estimated effort:** ~2-3 sessions across 4 phases

## Open Risks & Assumptions

- v2 → v3 upgrade triggers false-positive conflict prompts for files changed between lessons (accepted trade-off for no blind window)
- The `.user.<ext>` backup files accumulate if the user repeatedly saves backups — no auto-cleanup mechanism planned
- If the API ever sends multi-file skills with content that generates hash collisions (astronomically unlikely with SHA-256), a false negative could occur

## Success Criteria (Summary)

- User-modified skill/prompt files trigger an interactive prompt before overwriting
- Non-TTY mode never silently destroys user edits (defaults to skip)
- File removals during lesson transitions are visible in output as `[removed]` lines
