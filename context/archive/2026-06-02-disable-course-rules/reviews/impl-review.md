<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Disable Course Rules

- **Plan**: context/changes/disable-course-rules/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verification (run live)

- `bun run typecheck` ✅
- `bun run lint` ✅ (5 pre-existing control-char warnings, 0 errors)
- `bun test` ✅ 446 pass / 0 fail
- `bun run build` ✅
- `10x get … --course-rules` exits 0 (parses, not USAGE); `--bogus-flag` exits 2 ✅
- Plan drift: 15/15 planned changes MATCH; 0 drift, 0 missing, 0 unplanned.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — updateToolConfig masks an invalid no-`tool` merge

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/config.ts:191-195
- **Detail**: `const merged = { ...current, ...patch } as ToolConfig`. When `readToolConfig()` returns null because config.json is corrupt (parse error caught → null, config.ts:168), `updateToolConfig` silently overwrites it with just `{ ...patch }`. The `as ToolConfig` cast hides that a patch lacking `tool` would yield an object with no `tool`, which the next `readToolConfig()` then rejects wholesale, silently dropping lang/acknowledgedOrphans. Safe for the only current caller (get.ts:149 always seeds `tool`), but unenforced for any future caller. The docstring states the requirement in prose; nothing checks it.
- **Fix**: After building `merged`, assert `typeof merged.tool === "string"` and throw if not, before `saveToolConfig` — turning a silent config wipe into a loud, debuggable error.
- **Decision**: FIXED (config.ts:194-200 — throws when merged config has no `tool`)

### F2 — Removed-rules render path & positive flag are untested

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/get-command.test.ts (gap); src/commands/get.ts:545-552
- **Detail**: Every success-criteria checkbox passes, but two paths have no test. (1) No command-level test applies the block then runs `--no-course-rules` and asserts the block is stripped from CLAUDE.md AND `writes.rules.action === "removed"` AND the human `[removed] rules` line renders — the `renderGetResult` removed branch (get.ts:545-552) is effectively uncovered. Strip is tested at the `applyBundle` level (writer.test.ts:1065) but not through the command. (2) The positive `--course-rules` form is only unit-tested against a hand-built argv array; it's never driven through CAC. Confirmed live that `--course-rules` exits 0 (no USAGE regression), so this is a guard gap, not a bug.
- **Fix**: Add a command-level strip-after-apply test asserting the `"removed"` action + `[removed] rules` output line; optionally a thin `--course-rules` end-to-end parse test.
- **Decision**: FIXED (tests/get-command.test.ts — added 3 tests: JSON strip-after-apply with surrounding-content preservation, human `[removed] rules` render, positive `--course-rules` CAC parse. 449 pass. Note: harness `captureStreams` has a pre-existing race when a single test calls runGet twice — tests pre-seed the block to use a single run.)

### F3 — Redundant half of the strip guard

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/writer.ts:293
- **Detail**: `if (removed && stripped !== existingRules)`. `removeRulesBlockWithMarkers` only returns `removed:true` when both markers exist and are ordered, in which case the splice always changes the content — so `stripped !== existingRules` is effectively dead when `removed` is true. Harmless belt-and-suspenders.
- **Fix**: None required — leave as a defensive guard, or simplify to `if (removed)`.
- **Decision**: SKIPPED (kept as a defensive guard)

### F4 — resolveCourseRulesFlag reads global process.argv inside runGet

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/commands/get.ts:142
- **Detail**: `runGet` re-reads the global `process.argv` rather than an injected value, so a programmatic caller not going through CLI parse gets `undefined` even if `options.courseRules` was set. Deliberate and documented (CAC collapses default & positive form); the helper itself is pure and tested. Noted for future embeddability only.
- **Fix**: None now — consider threading the resolved tri-state through `runGet` params if the command is ever embedded.
- **Decision**: SKIPPED (accepted the documented argv-peek design)
