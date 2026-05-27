# Frame Brief: User-Edit Protection for Skills and Prompts

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

When running `10x get`, locally modified skill and prompt files are silently
overwritten. File removals during lesson-transition cleanup are also silent —
no `[removed]` line appears in output.

## Initial Framing (preserved)

- **User's stated cause or approach**: `computeFileAction()` does a plain string compare and cannot distinguish "API updated upstream" from "user edited locally." The manifest stores filenames but not content hashes, so three-way conflict detection is structurally impossible.
- **User's proposed direction**: Three-way conflict detection using content hashes, user-facing prompts on conflict (overwrite / save as `.user.md` / skip), and visible `[removed]` entries in output.
- **Pre-dispatch narrowing**: Both concerns (edit protection + removal logging) ship together. Non-TTY mode defaults to skip (safe). The hash distinction between "clean upstream update" and "user edit" is load-bearing — prompt only when the user actually edited.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Write decision logic** — `computeFileAction()` at `writer.ts:237-246` does a binary same/different check with no awareness of who changed what. No hash, no history, no prompt. ← **initial framing**
2. **Manifest data model** — `CliManifest` at `manifest.ts:24-42` stores filenames but not content hashes. Even if the write logic wanted three-way detection, it has no data to work with. Enabling condition for #1.
3. **File ownership model** — skills/prompts are treated as CLI-owned (overwrite freely). An alternative: treat them as user-owned once written (skip-on-exists, like configs at `writer.ts:183-190`), eliminating the need for hashes entirely.
4. **Git-based tracking** — the project is typically a git repo. Could the CLI leverage `git status` to detect user modifications instead of its own hash tracking?

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Write logic lacks three-way awareness (dim 1) | `computeFileAction()` (`writer.ts:237-246`) returns `"updated"` for any content difference — no hash, no prompt, no backup. Caller at `writer.ts:135-137` unconditionally overwrites. | **STRONG** |
| Manifest lacks hash storage (dim 2) | `CliManifestSkillEntry` (`manifest.ts:19-22`) stores only `files: string[]`. Writer builds manifest at `writer.ts:215-220` recording only paths. API sends `contentHash` (`api-types.ts:116,122,128,134`) but CLI types (`api-content.ts:64-81`) strip it. | **STRONG** |
| Skip-on-exists could replace hashes (dim 3) | Tests at `writer.test.ts:226-244` explicitly assert content updates across lessons (`"# TDD v1\n"` → `"# TDD v2\n"`). Skip-on-exists would block legitimate upstream updates. Configs use skip-on-exists because they're one-time templates; skills/prompts get updated content between lessons. | **NONE** — would break the system |
| Git-based tracking (dim 4) | CLI has zero git dependencies (no `child_process`, no git library in `package.json:32-47`). All tests use plain `mkdtempSync` dirs. This is a learning-environment CLI — users may not have git initialized. `tool-profile.ts` paths (`.claude/`, `.cursor/`, `.github/`) are not gitignored but tracking is not assumed. | **NONE** — not viable |

## Narrowing Signals

Step 3 evidence was conclusive — the alternative framings have no supporting evidence and strong counter-evidence. Narrowing questions were skipped per protocol.

- Skip-on-exists is ruled out: tests assert that skill content updates (v1 → v2) across lessons must flow through (`writer.test.ts:226-244`).
- Git-based tracking is ruled out: zero git integration, learning-environment user base, test infrastructure uses plain temp dirs.
- The existing `moveIfSafe()` precedent in `tool-switch.ts:212-273` confirms the codebase already has the concept of "don't clobber different content" — it just isn't applied to the lesson-apply path.

## Cross-System Convention

Three-way merge using a common ancestor hash is a well-established pattern (git's merge model, Ansible's backup/checksum system). The approach matches the convention: store a hash of what was originally written, compare it against local state on the next write to determine if the user or the system changed the file.

The codebase already has a related precedent: `moveIfSafe()` in `tool-switch.ts:229-239` refuses to overwrite files with different content during tool migration. The three-way hash approach generalizes this to the lesson-apply path.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: The CLI's write path treats local files as a dumb cache — it has no mechanism to distinguish user modifications from upstream updates, because it doesn't track what it originally wrote.

The initial framing was correct — proceed with the originally proposed direction. The fix is hash-based three-way conflict detection: store per-file content hashes in the manifest at write time, compare against local state on re-apply to distinguish "user edited" (local ≠ stored hash) from "clean upstream update" (local == stored hash, new content differs).

**One detail for /10x-plan**: The API's `contentHash` maps cleanly to individual files for prompts, rules, and configs (one content, one hash). For skills, the hash is per-skill (`api-types.ts:108-117`) — one hash covering all files in the skill. For single-file skills this is effectively per-file and the three-way model works directly. For multi-file skills, /10x-plan needs to decide: prompt at the skill level (coarser) or compute per-file hashes locally (finer-grained).

## Confidence

- **HIGH** — strong evidence confirms the user's framing, alternative hypotheses have no supporting evidence, approach matches established conventions (three-way merge) and existing codebase precedent (`moveIfSafe`).

## What Changes for /10x-plan

The plan should implement three-way conflict detection using the API's `contentHash` stored in the manifest at write time, with local hash computation on re-apply to detect user edits. For multi-file skills, the plan needs to decide between skill-level prompting or local per-file hashes. The plan should also cover non-TTY behavior (default to skip) and `[removed]` entry visibility in `WriteResult` output.

## References

- Source files: `src/lib/writer.ts:237-246` (computeFileAction), `src/lib/writer.ts:192-202` (silent removal), `src/lib/manifest.ts:19-42` (manifest types), `src/lib/api-content.ts:64-81` (runtime types stripping contentHash), `src/generated/api-types.ts:116` (API sends contentHash), `src/lib/tool-switch.ts:212-273` (moveIfSafe precedent)
- Related research: `context/changes/content-overwrite/research.md`
- Parent change: `context/changes/content-overwrite/change.md`
