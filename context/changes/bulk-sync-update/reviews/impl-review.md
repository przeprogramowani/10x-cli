<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: `10x sync` — Bulk Download & Update with Change Visibility

- **Plan**: context/changes/bulk-sync-update/plan.md
- **Scope**: All 4 phases (two-repo: 10x-cli + 10x-toolkit)
- **Date**: 2026-06-20
- **Verdict**: NEEDS ATTENTION → resolved (opened REJECTED on F1; F1 fixed during triage)
- **Findings**: 1 critical, 2 warnings, 1 observation — all resolved

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL → fixed (F1) |
| Architecture | PASS |
| Pattern Consistency | WARNING → fixed (F2, F3) |
| Success Criteria | PASS (tests run green both repos) |

Overall opened **REJECTED** on F1 (the data-safety false-negative the plan explicitly designed against). With F1 fixed and verified, the blocker is cleared. The implementation was otherwise a faithful, well-structured match to the plan: `planBundle`/`applyBundle` parity, path-traversal hardening, no-mid-loop-`process.exit`, and the skip-default conflict resolver all held up.

## Findings

### F1 — Lesson digest hashes only SKILL.md → sync silently skips updated multi-file skill files

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; cache-key interaction
- **Dimension**: Safety & Quality
- **Location**: 10x-toolkit/packages/course-content/scripts/transform-content.mjs:363 (skill.contentHash) → :625 (computeLessonDigest)
- **Detail**: The per-lesson catalog digest aggregated `skill.contentHash`, which is `sha256(skillMd.content)` for the `SKILL.md` file only (`skillMdFrom`). A skill ships an arbitrary `files[]` array (`skillBundleSchema`); `build/core.ts:59-91` `walkSkill` recursively bundles every file (e.g. `scripts/check-context.sh`, `references/current.md`) and the CLI writer materializes all of them. Editing any non-`SKILL.md` skill file therefore did not move `skill.contentHash` → did not move the lesson digest → `10x sync` cheap-skipped the lesson (`sync.ts:240-254`) and the updated file never reached the learner. This is exactly the "same digest but content changed" false-negative the plan names as "the one outcome to design against" (plan.md:114-119). Latent at review time — all current 10xdevs3 skills are single-file ("Bundled skill … with 1 files") — but the build fully supports multi-file skills (test fixtures already use them).
- **Fix A ⭐ (applied)**: Broaden `computeLessonDigest` to hash each skill's full file set (sorted `path:sha256(content)`, version-embedded), leaving `skill.contentHash` (the LLM-transform cache key) untouched so sibling-file edits don't force needless re-translation. Added two regression tests (`catalog-digest.test.ts`): non-`SKILL.md` change moves the digest; reordering files is stable.
- **Decision**: FIXED via Fix A — commit 5f2ed28 (10x-toolkit)

### F2 — Manifest write is non-atomic; sync rewrites it per-lesson

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Reliability / Pattern Consistency
- **Location**: 10x-cli/src/lib/manifest.ts:97-105 (writeManifest)
- **Detail**: `writeManifest` used plain `writeFileSync` — no tmp+rename. Pre-existing (introduced in 530592d), but `10x sync` amplifies it by rewriting the manifest once per applied lesson across a sweep; an interrupt mid-write truncates it, and `readManifest` degrades a corrupt manifest to `null` (manifest.ts:89), silently dropping all per-lesson tracking. The repo already documents the atomic pattern for `saveAuth`.
- **Fix (applied)**: Write to a sibling `.tmp` then `renameSync` into place, matching `saveAuth` in config.ts.
- **Decision**: FIXED — commit d0d3795 (10x-cli)

### F3 — AbortController created and threaded but never aborted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: 10x-cli/src/commands/sync.ts:183 (controller), :196/:260 (signal)
- **Detail**: The "shared AbortSignal" the plan calls for existed in shape only — `controller.signal` was passed into every `fetchLesson`, but nothing ever called `controller.abort()` (no SIGINT handler, no deadline). It read as cancellation support that didn't exist (the per-call 30s timeout still applied).
- **Fix (applied)**: `process.once("SIGINT", () => controller.abort())`; the loop breaks at the next lesson boundary on `signal.aborted`; handler removed in `finally`.
- **Decision**: FIXED — commit d0d3795 (10x-cli)

### F4 — contentHash CI guard is stricter and placed differently than planned

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: 10x-toolkit/packages/course-content/scripts/transform-content.mjs:667-681
- **Detail**: Plan P1.2 specified a post-transform assertion (in `validate:bundles` or transform) that every *published* lesson has a non-empty `contentHash`. Implemented as an unconditional throw inside `updateCatalogLanguages` for *every* catalog lesson (no published-vs-unpublished distinction). Functionally stricter = safer, but a legitimately config-only lesson would hard-fail the build.
- **Fix (applied)**: Left as-is (stricter is safe); added a comment documenting the assumption (no config-only lesson reaches the catalog) and when to scope it to published lessons.
- **Decision**: ACCEPTED (documented) — commit 5f2ed28 (10x-toolkit)

## Verification

Gates re-run green after fixes:
- **10x-cli**: `bun run typecheck` clean · `bun run lint` 0 errors (5 pre-existing warnings) · `bun test` 469 pass / 0 fail · `bun run build` ok
- **10x-toolkit**: `pnpm lint` 0 errors · `pnpm fmt:check` clean · `pnpm test` 292 (api) + 73 (course-content, incl. 2 new) pass · `pnpm --filter course-content build:lessons` ok
