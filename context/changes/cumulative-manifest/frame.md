# Frame Brief: Cumulative Manifest

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Running `10x get` for different lessons causes artifacts from previously-fetched
lessons to be deleted. The manifest tracks a single `lessonId` and
`computeRemovals()` deletes anything absent from the new bundle. The `[removed]`
lines from user-edit-protection now make this *visible*, but the behavior is
still destructive. The course-content repo works around this with a fragile
spread pattern (`[...previousLesson.artifacts.root.skills]`).

## Initial Framing (preserved)

- **User's stated cause or approach**: The single-lesson `lessonId` in the manifest data model is the root cause. The fix is per-lesson file ownership tracking (`lessons?: Record<string, LessonFilesEntry>`) with scoped removals via a "protected set" — files claimed by other lessons are exempt from cleanup.
- **User's proposed direction**: Fold the per-lesson ownership model into manifest v3 (alongside user-edit-protection) before release. Rewrite `computeRemovals()` to scope per-lesson. Rebuild `files` as union of all lesson entries.
- **Pre-dispatch narrowing**: Artifact loss in CLI is the leading concern (spread pattern is a side effect). CLI-only fix is correct (API stays per-lesson). No-removal could work — accumulate-only might be viable.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Manifest data model** — `lessonId` is a single string; no multi-lesson state. Each `get` overwrites the manifest's view of what should exist. ← initial framing
2. **Removal logic scope** — `computeRemovals()` treats "absent from new bundle" as "delete." Even with perfect multi-lesson tracking, aggressive auto-removal is the proximate cause of data loss.
3. **Whether auto-removal is needed at all** — If stale files are harmless (or merely confusing) and the CLI just accumulates, the per-lesson ownership model + protected-set logic may be unnecessary.
4. **v3 complexity budget** — Folding per-lesson ownership into v3 before release adds significant surface area. If a simpler shape achieves the goal, the complexity isn't justified for this release.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **Manifest data model** (per-lesson ownership needed) | Single `lessonId` confirmed as root cause (`manifest.ts:37`, `writer.ts:339`). Per-lesson tracking IS the minimum structure for scoped removal. | **STRONG** |
| **Removal logic scope** (removal too aggressive) | `computeRemovals()` at `writer.ts:423-491` diffs entire manifest against bundle. Disabling: get command still works (`get.ts` unaffected), tool-switch unaffected. 3/4 removal tests fail (expected). | **STRONG** |
| **No removal needed** (accumulate-only viable) | Stale skills: **HARMFUL if renamed** (AI tools auto-index, ghost skills compete for activation). But user confirmed **skill names are stable** — no renames planned or historical. Stale prompts: CONFUSING (clutter in palette, on-demand only). Stale configs: HARMLESS (inert templates). | **STRONG for accumulate-only** given stable names |
| **v3 complexity budget** (per-lesson model too heavy) | Per-lesson: ~180-340 lines prod+test, 2 new functions, protected-set logic. Accumulate-only: ~40-50 lines total, 0 new functions. **5-7x simpler.** | **STRONG** |

## Narrowing Signals

Decisive observations that narrowed the hypothesis space:

- **Skill names are stable.** No renames have happened or are planned. This eliminates the most harmful stale scenario (ghost skill with overlapping description competing for activation). Without rename risk, stale files degrade to CONFUSING, not HARMFUL.
- **"Simple guard" approach doesn't work.** An independent investigation proposed skipping removal only when the lesson is new. But on re-apply of the same lesson, `computeRemovals()` still compares against the full `files` field and would delete other lessons' artifacts. Correct re-apply scoping requires per-lesson file ownership — there is no middle ground between "full per-lesson model" and "no removal at all."
- **Union `files` field is safe when removal is disabled.** Content hash detection reads by file path (orthogonal to lesson ownership — `writer.ts:166, 226`). Tool migration (`tool-switch.ts:69-124`) benefits from migrating everything. Only `computeRemovals()` breaks — and it's disabled.
- **Timing depends on complexity.** User explicitly said: if folding into v3 is clean, do it; if it risks the release, defer. Per-lesson ownership is 5-7x heavier than accumulate-only.

## Cross-System Check

An independent sub-agent (no knowledge of the proposed solution) investigated the simplest fix. It independently converged on "track `appliedLessons[]` + guard removal" — confirming the root cause diagnosis. However, the proposed guard has an edge case on re-apply that requires per-lesson file scoping. This independently validates that **there are exactly two viable approaches**: full per-lesson ownership (complex, handles re-apply cleanup) or accumulate-only (simple, defers cleanup).

A second sub-agent verified that making `files` a running union breaks `computeRemovals()` and test assertions — but these are moot when removal is disabled. Hash detection and tool migration work correctly with a union.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: The manifest's single-lesson design causes cross-lesson artifact deletion, but the proposed fix (per-lesson ownership with scoped removal) is over-specified for the current constraints — stable skill names make auto-removal unnecessary for v3.

The initial framing correctly identifies the root cause (single `lessonId`, aggressive `computeRemovals()`). But the proposed solution is calibrated for a scenario that doesn't apply yet: skill renames causing harmful ghost skills. Since skill names are stable, the complexity of per-lesson ownership + protected-set logic isn't justified for the v3 release. Accumulate-only (union `files`, disabled removal, `appliedLessons` tracking) solves the original bug with 5-7x less code and zero deletion risk. Per-lesson scoped cleanup can be added in v4 if stale file management becomes a user need.

## Confidence

**HIGH** — strong evidence across all dimensions: root cause verified in code, stale-file harm mitigated by stable skill names (user-confirmed), complexity comparison quantified (5-7x), independent investigation converged on the same binary choice.

## What Changes for /10x-plan

The plan should target **accumulate-only for v3**: union `files` merge, disabled `computeRemovals()`, `appliedLessons?: string[]` tracking. The `lessons` record, `allFilesFromLessons()` helper, and scoped `computeRemovals()` rewrite from the research are **deferred to v4** — they're the right design for when the course needs skill renames or explicit stale-file cleanup, but not for this release.

## References

- Source files: `src/lib/writer.ts:305,334-354,423-491`, `src/lib/manifest.ts:24-51,93-109`, `src/commands/get.ts:445-514`, `src/lib/tool-switch.ts:69-124`
- Parent research: `context/changes/content-overwrite/research.md`
- Cumulative research: `context/changes/cumulative-manifest/research.md`
- User-edit-protection commits: ed64a98..134388a
- Investigation tasks: #1 (removal impact), #2 (complexity comparison), #3 (stale scenarios), #4 (v3 budget)
