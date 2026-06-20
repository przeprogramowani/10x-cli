# `10x sync` — Bulk Download & Update with Change Visibility — Implementation Plan

## Overview

Add a `10x sync` command that lets learners (1) download every unlocked lesson for a
course in one shot and (2) refresh artifacts they already downloaded, with a clear
report of **what changed upstream** and **what was left untouched** (and how to take
those updates). To make the "what changed" check cheap, the backend gains a per-lesson
`contentHash` on the catalog endpoint so the CLI can skip unchanged lessons without
downloading them.

This is a coordinated two-repo change: `10x-toolkit` (catalog digest, backend-first)
then `10x-cli` (`planBundle()` writer refactor → `10x sync` command → tests/docs).

## Current State Analysis

- **Enumeration is already one call.** `fetchCatalog` hits `GET /api/catalog/:course`
  and returns all unlocked lessons across all modules in `catalog.lessons`
  (`10x-cli/src/lib/api-content.ts:104-113`); locked-module lessons are omitted. The
  evangelist's manual `list m0 / list m1 …` loop is redundant.
- **Re-apply is already safe + idempotent.** `applyBundle` does three-way SHA-256
  conflict detection: clean upstream change applied, unchanged left alone, user-edit →
  conflict resolver (non-TTY default `skip` — user work never silently lost)
  (`10x-cli/src/lib/writer.ts:445-464`, `conflict-prompt.ts:4-40`).
- **The manifest already stores per-file content hashes** for skills and prompts
  (`10x-cli/src/lib/manifest.ts:20-22, 24-29`) and a per-lesson ownership record
  `lessons: Record<string, LessonFilesEntry>` whose keys are the iteration set for an
  "update what I have" sweep (`manifest.ts:31-36`).
- **No cheap upstream change signal exists today.** The catalog carries no per-lesson
  hash/etag/timestamp (`10x-toolkit/packages/api/src/routes/catalog.ts:14-27`); the
  only real hash (`X-Bundle-Content-Hash`) is a request-time, variant-specific signing
  header (`lessons.ts:153-161`). So "did this change?" currently requires downloading
  the full bundle.
- **But the substrate exists at build time.** A per-artifact `contentHash` is computed
  by `10x-toolkit/packages/course-content/scripts/transform-content.mjs:100-101` and
  the schema already reserves the slot (`schemas/bundle.ts:6-8, 20-21`). The catalog is
  built in the same run (`build/core.ts:160-183`), so a per-lesson digest is nearly
  free to publish.
- **`computeFileAction` is module-private** (`writer.ts:445-464`); there is no exported
  pure planner that returns per-file actions + conflict flags without writing or
  prompting. `--dry-run` exists in `get` but in TTY mode `await`s `onConflict` before
  the write guard (`writer.ts:189-197`), so a clean non-prompting preview needs a new
  planner.
- **`handleLessonError` calls into `outputError` → `process.exit`**
  (`get.ts:385-468`); reused raw in a loop it would abort the whole sweep on the first
  error.

## Desired End State

A learner runs `10x sync` and sees their already-downloaded lessons refreshed with a
report like "3 lessons updated, 2 skills changed, 1 file skipped (you edited it — run
`10x get m2l3 --type skills --name auth-skill` to take the update), 8 unchanged". They
run `10x sync --all` to pull every unlocked lesson at once, and `10x sync --dry-run` to
preview changes without writing. Unchanged lessons are skipped **without** a download,
because the catalog now advertises a per-lesson `contentHash` the CLI compares against
what it last applied.

Verify: `bun test` passes in `10x-cli` (incl. new sync tests); `GET /api/catalog/10xdevs3`
returns a `contentHash` per lesson; a real `10x sync` against a local API shows the
cheap-skip and the actionable report.

### Key Discoveries

- One catalog call enumerates everything fetchable — `api-content.ts:104-113`.
- Safe re-apply is inherited for free — `writer.ts:445-464`, `conflict-prompt.ts:8`.
- Per-artifact build-time hash already exists — `transform-content.mjs:100-101`,
  `schemas/bundle.ts:6-8`.
- Catalog handler spreads `catalog.lessons` raw, so a new schema field flows through
  with no handler logic — `10x-toolkit/packages/api/src/routes/catalog.ts:79`.
- Course/module/lesson map + lock resolution — `course-content/src/courses/10xdevs3/index.ts:34-44`,
  `packages/api/src/lib/module-state.ts:3-11`.

## What We're NOT Doing

- **No config/rules change reporting.** Configs aren't hashed (skip-on-exists) and
  rules are sentinel-managed, not manifest-tracked. The change report covers skills +
  prompts only. (The per-artifact build hashes for configs/rules exist and could be
  folded into the lesson digest later — out of scope here.)
- **No per-`{tool,lang}` catalog digest.** One digest per lesson (an aggregate of the
  version-mixed per-artifact hashes), not a map keyed by tool/lang. It changes on any
  variant-affecting change (source edit or `SYSTEM_PROMPT_VERSION` bump), so it never
  *under*-reports; the cost is occasional benign over-fetch for a given user's variant,
  which the writer resolves as unchanged.
- **No `If-None-Match`/304 conditional-request layer**, no new bulk/diff/manifest
  endpoint — the catalog field subsumes those for our needs.
- **No concurrency beyond a small bounded pool / sequential** — no retry/backoff
  framework; the existing 30s per-call timeout and `rate_limited` mapping stand.
- **No change to `get`'s single-lesson contract** — `sync` is a new command.

## Implementation Approach

Backend-first so the CLI gets cheap change-detection from day one, but the CLI is
written **defensively**: `LessonSummary.contentHash` is optional, and when it's absent
(older backend) `sync` falls back to always-fetch. The catalog digest is a base-variant
"did the source content change?" fingerprint stored back into the manifest per lesson;
next sync compares new-catalog-digest vs stored-digest to decide skip-vs-fetch. The
writer gains a pure `planBundle()` so `sync` can classify and preview without writing or
prompting, and `applyBundle` consumes the same planner so behavior can't drift.

## Critical Implementation Details

- **The digest is an aggregate of existing per-artifact `contentHash`es, NOT a fresh
  base-bundle hash.** Each published artifact already carries
  `contentHash = sha256("<SYSTEM_PROMPT_VERSION>:" + source)` for skills/prompts/rules
  (`transform-content.mjs:364,408`); configs are unhashed. The per-lesson catalog digest
  = `sha256` over the lesson's artifact hashes in a deterministic order
  (e.g. sorted `"<type>/<name>:<hash>"` lines). **Why not a plain base-bundle hash:** a
  base-source-only hash does not move on a `SYSTEM_PROMPT_VERSION` bump, but such a bump
  regenerates `universalContent` — the bytes non-Claude-tool users download — so a
  base-only digest would *silently skip* that update (a false negative). The
  version-mixed aggregate moves on source edits AND version bumps. Configs being excluded
  is safe: the writer treats configs as create-only, so an upstream config change never
  overwrites an existing file — there is nothing for `sync` to miss.
- **Failure-mode asymmetry — err toward over-fetching.** The digest is only a fetch/skip
  gate; the "what changed" report always comes from the writer's real per-file hashing
  after a fetch. A digest *false positive* (differs but content same) costs one wasted
  fetch the writer then reports as unchanged — harmless. A digest *false negative* (same
  but content changed) silently skips an update — the one outcome to design against. The
  aggregate above is chosen specifically to avoid false negatives.
- **Digest-vs-digest, never digest-vs-written-files.** The CLI stores the exact
  catalog-provided digest per lesson in the manifest on apply, and on the next sync
  compares the *new* catalog digest against the *stored* catalog digest. It must never
  compare the catalog digest against the per-file written hashes — those live in a
  different (transformed, variant-specific) hash space and would mismatch every run.
- **`--force` and `--dry-run --force` must bypass the cheap-skip gate.** Because the
  digest skip happens *before* fetch, `--force` cannot overwrite a locally-edited file
  when upstream is unchanged unless it skips the gate and always fetches. `--force` ⇒
  ignore the stored digest, fetch every targeted lesson, apply with the overwrite
  resolver.
- **Cheap-skip reports upstream state, not local drift.** A digest match means "upstream
  unchanged since last apply" and is reported `unchanged` without reading local files; it
  intentionally does not detect or repair a user's local edits when upstream hasn't moved
  (use `get` or `--force` to restore). A plain `get` between syncs does not refresh the
  stored digest, so at most one redundant fetch can occur on the next sync (writer
  confirms unchanged) — acceptable.
- **Ordering / cross-repo coupling.** `10x-cli`'s `src/generated/api-types.ts` is
  generated from the deployed `/openapi.json` and must never be hand-edited
  (`10x-cli/CLAUDE.md`). So Phase 2's type regeneration depends on Phase 1 being
  deployed. Until then, `sync` works against a catalog without `contentHash` via the
  always-fetch fallback.
- **Never `process.exit` mid-sweep.** `sync` needs its own per-lesson outcome
  accumulator and emits exactly one aggregate envelope at the end; `handleLessonError`'s
  exit-on-first-error path (`get.ts:385-468`) must not be reused raw inside the loop.

---

## Phase 1: Backend — per-lesson `contentHash` on the catalog (`10x-toolkit`)

### Overview

Publish a stable base-variant digest per lesson on `GET /api/catalog/:course` so the CLI
can detect changed lessons in one request.

### Changes Required:

#### 1. Compute + write the per-lesson digest in the transform step

**File**: `10x-toolkit/packages/course-content/scripts/transform-content.mjs` (`updateCatalogLanguages`, 615-628, + main flow ~740)

**Intent**: After transform has populated per-artifact `contentHash`es into each lesson
bundle, aggregate them into a per-lesson digest and write it onto each catalog lesson.
This is the natural home because (a) the artifact hashes only exist post-transform, (b)
this function already does a read-modify-write of `catalog.json` that preserves other
fields, and (c) the digest must be `SYSTEM_PROMPT_VERSION`-aware to avoid silently
skipping re-translations (see Critical Implementation Details). Runs in CI on publish;
local `build:lessons`-only runs leave `contentHash` absent → CLI always-fetch fallback.

**Contract**: For each catalog lesson, read its transformed bundle
(`<lessonId>.json`), collect the `contentHash` of every skill/prompt/rule, and set
`lesson.contentHash = sha256(sortedJoin("<type>/<name>:<hash>"))` (lowercase hex,
deterministic order). Configs have no hash and are excluded (safe — writer treats configs
as create-only). Preserve the existing `availableLanguages` write.

#### 2. Make `contentHash` an optional catalog-schema field

**File**: `10x-toolkit/packages/course-content/src/schemas/catalog.ts` (`catalogLessonSchema`, ~10-18)

**Intent**: Allow the field on a catalog lesson. It must be **optional**, because
`build:lessons` (`core.ts:buildCatalog`) emits the catalog *before* transform runs and
cannot populate it; the transform step fills it in.

**Contract**: Add `contentHash: z.string().optional()` to `catalogLessonSchema`. Add a
post-transform assertion (in `validate:bundles` or the transform script) that every
*published* lesson has a non-empty `contentHash`, so a missing digest fails CI rather
than silently degrading the CLI to always-fetch in production.

#### 3. Surface the field through the delivery API

**File**: `10x-toolkit/packages/api/src/routes/catalog.ts` (`enrichedCatalogSchema`, ~14-27)

**Intent**: Allow the field to pass through the API's response schema. The handler
already spreads `catalog.lessons` raw (`catalog.ts:79`), so no handler logic changes —
only the schema needs widening.

**Contract**: Add `contentHash: z.string()` to the lesson object in
`enrichedCatalogSchema`. Confirm it appears in the generated `/openapi.json`.

### Success Criteria:

#### Automated Verification:
- Digest aggregation is unit-tested over a fixture bundle: deterministic for fixed input, changes when any artifact hash changes, stable under artifact reordering (sorted), configs ignored
- `catalogLessonSchema` accepts a lesson with and without `contentHash` (optional): `pnpm --filter @przeprogramowani/course-content test`
- API tests pass (catalog route surfaces `contentHash` when present, passes schema): `pnpm --filter @przeprogramowani/api test`
- `build:lessons` still succeeds emitting catalog **without** `contentHash` (pre-transform): assert build is green and schema-valid
- Typecheck + lint pass across both packages

#### Manual Verification:
- After a real transform run, every lesson in `dist/10xdevs3/catalog.json` has a non-empty `contentHash`; re-running transform with no content change leaves each `contentHash` identical (deterministic)
- Edit one skill's `SKILL.md` + re-transform → only that lesson's `contentHash` changes
- Bump `SYSTEM_PROMPT_VERSION` → every lesson's `contentHash` changes (proves version-bump is captured, no silent skip)
- `GET /api/catalog/10xdevs3` (local API, R2 seeded with transformed output) returns `contentHash` on every lesson

**Implementation Note**: After automated verification passes, pause for human
confirmation that the digest is deterministic and changes only on real content edits
before proceeding. Deploy the API so `/openapi.json` carries the field (prerequisite for
Phase 2's type regeneration).

---

## Phase 2: CLI — `planBundle()` writer refactor + types (`10x-cli`)

### Overview

Extract a pure, non-writing, non-prompting planner so `sync` can classify and preview
changes, and wire the new catalog field into the CLI's types.

### Changes Required:

#### 1. Export a pure planner from the writer

**File**: `10x-cli/src/lib/writer.ts` (around `computeFileAction`, 445-464)

**Intent**: Provide `planBundle(bundle, projectRoot, { profile }): WritePlan` returning
per-file `{ path, action, isConflict, upstreamChanged }` **without** invoking
`onConflict` and **without** any filesystem mutation. Refactor `applyBundle` to consume
the same planner so classification and application can't diverge.

**Contract**: New exported `planBundle()` + a `WritePlan` type listing per-file entries
with the existing `ArtifactAction` union plus `isConflict: boolean` and
`upstreamChanged: boolean`. `computeFileAction`'s three-way logic moves into / is reused
by the planner. `applyBundle`'s observable behavior (actions, removals, conflict
handling) is unchanged.

#### 2. Add optional `contentHash` to `LessonSummary`

**File**: `10x-cli/src/lib/api-content.ts` (`LessonSummary`, 27-35)

**Intent**: Carry the new catalog field so `sync` can read it; optional so the CLI still
works against a backend that doesn't yet publish it.

**Contract**: Add `contentHash?: string` to `LessonSummary`.

#### 3. Regenerate the API types from the deployed OpenAPI

**File**: `10x-cli/src/generated/api-types.ts` (generated — do not hand-edit)

**Intent**: Pick up the new catalog field from the deployed spec.

**Contract**: Run `bun run generate-types` (against the deployed API, or
`API_BASE_URL=…` for a local one). The regenerated catalog response type includes
`contentHash` on lesson summaries. **Prerequisite: Phase 1 deployed.**

### Success Criteria:

#### Automated Verification:
- Typecheck passes: `bun run typecheck`
- Lint passes: `bun run lint`
- Writer tests pass, including new `planBundle` parity tests: `bun test tests/writer*.test.ts`
- Regenerated `api-types.ts` contains `contentHash` on the catalog lesson type

#### Manual Verification:
- `planBundle` output matches `applyBundle`'s resulting actions for a representative bundle (clean update, unchanged, user-edit conflict, new file)
- A TTY `--dry-run` preview built on `planBundle` does NOT prompt

**Implementation Note**: Pause for human confirmation that `planBundle`/`applyBundle`
parity holds before building the command on top of it.

---

## Phase 3: CLI — the `10x sync` command (`10x-cli`)

### Overview

The user-facing command: enumerate, cheap-skip unchanged, fetch-and-apply the rest,
emit one actionable report, exit by worst outcome.

### Changes Required:

#### 1. New command module

**File**: `10x-cli/src/commands/sync.ts` (new) + registration in `10x-cli/src/index.ts`

**Intent**: Add `registerSyncCommand(cli)` following the existing command pattern and
wire it into the shared CAC instance.

**Contract**: Command `10x sync` with flags `--all`, `--dry-run`, `--force`, `--module <mN>`,
`--course <slug>`, `--tool <tool>`, `--lang <lang>`, `--no-course-rules` / `--course-rules`,
`--json`, `--verbose`. Action callback goes through `resolveContext` / `outputError` per
the I/O contract; unknown-option → exit 2 preserved.

#### 2. Orchestration algorithm

**File**: `10x-cli/src/commands/sync.ts`

**Intent**: Drive the sweep using existing primitives without re-implementing fetch,
apply, or auth.

**Contract**:
- `requireAuth(ctx)` **once**; `resolveContext(options)`; `resolveToolProfile`; `readManifest`.
- `fetchCatalog` → unlocked lessons. Target set: **default** = unlocked ∩
  `Object.keys(manifest.lessons)`; **`--all`** = all unlocked; `--module mN` filters.
  Record locked/excluded lessons + reason from `modules[].effectiveState`.
- Per lesson, in module/lesson order, **sequentially or via a small bounded pool**
  sharing one `AbortSignal`:
  - **Cheap-skip**: if NOT `--force` AND `lesson.contentHash` present AND equals the
    manifest's stored per-lesson catalog digest → mark `unchanged`, do **not** fetch.
    `--force` bypasses this gate entirely (always fetch) so it can overwrite local edits
    even when upstream is unchanged. Absent `lesson.contentHash` or absent stored digest
    → fetch (fallback).
  - Else `fetchLesson` (keeps signature verification) → `planBundle` to classify.
  - If `--dry-run`: record the plan, write nothing.
  - Else `applyBundle` with a conflict resolver chosen by `--force`: default resolver =
    skip (report), `--force` resolver = overwrite. On apply, store the catalog's
    `lesson.contentHash` into the manifest for that lesson.
- Accumulate per-lesson outcomes; **never `process.exit` mid-loop**.

#### 3. Manifest: store the per-lesson catalog digest

**File**: `10x-cli/src/lib/manifest.ts` (`LessonFilesEntry`, 31-36, + read/write paths)

**Intent**: Persist the catalog digest that was current when a lesson was applied, so the
next sync can compare digest-vs-digest.

**Contract**: Add `catalogContentHash?: string` to `LessonFilesEntry`, written on apply,
tolerated as absent on read (older manifests → always-fetch fallback). Additive +
optional; keep manifest read backward-compatible (no forced version bump required —
follow the existing v3 tolerance pattern).

#### 4. Actionable aggregate report

**File**: `10x-cli/src/commands/sync.ts`

**Intent**: One envelope summarizing the sweep, where every resource that was **not**
updated tells the user the exact command to get it.

**Contract**: Human table + JSON `{ lessons: [...], totals: {...} }`. Classify per-file
actions into: `upstream-updated`, `created`, `unchanged`, `skipped-conflict`,
`removed`, plus per-lesson `errored`. For each **skipped-conflict** resource, include a
remediation command: targeted `10x get <lessonId> --type <type> --name <name>` to take
that one update, and a one-line global hint `10x sync --force` to take all upstream
updates. For each **errored** lesson, show the error + a retry command
(`10x get <lessonId>` or `10x sync --module <mN>`). Exit code = **worst outcome**: `0`
if all clean/unchanged; `1` (ERROR) if any lesson errored; conflicts-skipped alone stays
`0` (they're reported, not failures).

### Success Criteria:

#### Automated Verification:
- Typecheck + lint pass: `bun run typecheck && bun run lint`
- `10x sync --all` downloads all unlocked lessons (mocked catalog/bundles): `bun test tests/sync*.test.ts`
- Default `sync` targets only `manifest.lessons`; `--module` filters correctly
- Cheap-skip: a lesson whose catalog `contentHash` matches the stored digest is NOT fetched
- Changed lesson (digest differs) is fetched and applied
- `--force` bypasses the gate: a lesson whose digest matches IS still fetched and overwritten
- `--dry-run` writes nothing (assert no fs mutations) and still reports the plan
- Conflict default → `skipped-conflict` with a remediation command string in the report; `--force` → overwrite
- Partial failure (one lesson errors) → exit code `1`, full report still emitted
- Locked-module lessons excluded with a reason

#### Manual Verification:
- Real `10x sync --all` against a local API populates a fresh project in correct order
- Re-running `10x sync` after no upstream change reports all unchanged and downloads nothing
- After editing a downloaded skill, `sync` reports it skipped with a copy-pasteable `10x get …` command that then takes the update
- `--json` output is well-formed and stdout-only; human report is stderr-only

**Implementation Note**: Pause for human confirmation of the end-to-end UX (report
wording, remediation commands, exit codes) before finalizing docs.

---

## Phase 4: Tests & docs

### Overview

Lock in coverage and document the new command across both repos' contributor + user docs.

### Changes Required:

#### 1. Sync command test suite

**File**: `10x-cli/tests/sync-command.test.ts` (new) + reuse `tests/helpers/api-content-mock.ts`

**Intent**: Cover the matrix: full `--all` download, update-applied default, digest
cheap-skip (no fetch), changed-lesson fetch+apply, conflict skip+report+remediation,
`--force` overwrite, `--dry-run` no-write, partial-failure exit code, locked-module
exclusion, manifest digest round-trip.

**Contract**: `bun:test` with `mock.module()` / DI per repo convention; assert on the
JSON envelope and exit codes, not human strings where avoidable.

#### 2. User + contributor docs

**File**: `10x-cli/README.md`, `10x-cli/CHANGELOG.md`, `10x-cli/CLAUDE.md`, `10x-cli` AGENTS notes; `10x-toolkit/packages/api/contracts/delivery-api.md`

**Intent**: Document `10x sync` (flags, default vs `--all`, `--dry-run`, `--force`, the
report + remediation commands, exit-code semantics, the skills/prompts-only change-
visibility limitation) and the new catalog `contentHash` contract.

**Contract**: README "sync" section; CHANGELOG entry; CLAUDE.md sync notes; delivery-api
contract documents the catalog `contentHash` field. Update the `10x-cli-guide` skill if
it enumerates commands.

### Success Criteria:

#### Automated Verification:
- Full suite passes in both repos: `bun test` (10x-cli) and `pnpm test` (10x-toolkit api + course-content)
- Build + binary build pass: `bun run build && bun run build:binary`
- Lint + typecheck pass in both repos

#### Manual Verification:
- README accurately reflects observed `10x sync` behavior (flags, report, exit codes)
- delivery-api contract matches the deployed catalog response

**Implementation Note**: Final phase — confirm docs match real behavior before closing.

---

## Testing Strategy

### Unit Tests:
- `planBundle` parity with `applyBundle` across clean-update / unchanged / conflict / new-file
- Digest comparison logic: skip when equal, fetch when differ, fetch when catalog hash absent
- Report classification: per-file action → bucket; remediation-command construction
- Exit-code selection from mixed per-lesson outcomes

### Integration Tests:
- Mocked catalog + bundles: `--all` populates correct files in order; cheap-skip avoids fetch (assert fetch not called); `--dry-run` writes nothing; `--force` overwrites a conflicted file
- Backend: catalog route returns `contentHash`; build emits deterministic per-lesson digest

### Manual Testing Steps:
1. Local API + fresh project: `10x sync --all` → all unlocked lessons land in order.
2. Re-run `10x sync` → everything reported unchanged, zero downloads.
3. Edit a downloaded skill, run `10x sync` → reported `skipped-conflict` with a
   `10x get … --type skills --name …` command; run it → update taken.
4. `10x sync --force` → conflicted files overwritten with upstream.
5. `10x sync --dry-run` → report only, no writes.
6. Simulate one lesson 404 → exit code 1, full report still shown.

## Performance Considerations

A sync downloads only changed lessons once the catalog `contentHash` is live, collapsing
the common "nothing changed" case to a single catalog GET. Until then (older backend),
it re-downloads every targeted lesson. Keep the loop sequential or a small bounded pool
with a shared `AbortSignal`; respect the existing 30s per-call timeout and surface `429`
as today (no retry framework added).

## Migration Notes

`LessonFilesEntry.catalogContentHash` is additive + optional; existing manifests read
fine and simply always-fetch until the next apply records a digest. No data migration.

## References

- Research (CLI + backend): `context/changes/bulk-sync-update/research.md`
- Writer three-way detection: `10x-cli/src/lib/writer.ts:445-464`
- Catalog handler (spreads lessons raw): `10x-toolkit/packages/api/src/routes/catalog.ts:79`
- Build-time artifact hash: `10x-toolkit/packages/course-content/scripts/transform-content.mjs:100-101`
- Master plan non-goal (now reversed): `10x-toolkit/context/archive/2026-04-07-10x-cli-design/plan.md:63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — per-lesson contentHash on the catalog

#### Automated
- [x] 1.1 Course-content build emits a contentHash per lesson (assert in dist/10xdevs3/catalog.json) — 52446dd
- [x] 1.2 Course-content tests pass — 52446dd
- [x] 1.3 API tests pass (catalog route asserts contentHash present + schema-valid) — 52446dd
- [x] 1.4 Typecheck + lint pass across both packages — 52446dd

#### Manual
- [ ] 1.5 Build twice, no content change → identical per-lesson contentHash (deterministic)
- [ ] 1.6 Edit one skill → only that lesson's contentHash changes
- [ ] 1.7 GET /api/catalog/10xdevs3 returns contentHash on every lesson

### Phase 2: CLI — planBundle() writer refactor + types

#### Automated
- [x] 2.1 Typecheck passes — ca4d0bf
- [x] 2.2 Lint passes — ca4d0bf
- [x] 2.3 Writer tests pass, including planBundle parity tests — ca4d0bf
- [x] 2.4 Regenerated api-types.ts contains contentHash on the catalog lesson type — ca4d0bf

#### Manual
- [ ] 2.5 planBundle output matches applyBundle actions across clean/unchanged/conflict/new
- [ ] 2.6 TTY --dry-run preview built on planBundle does NOT prompt

### Phase 3: CLI — the 10x sync command

#### Automated
- [x] 3.1 Typecheck + lint pass
- [x] 3.2 `10x sync --all` downloads all unlocked lessons
- [x] 3.3 Default sync targets only manifest.lessons; --module filters
- [x] 3.4 Cheap-skip: matching catalog contentHash → lesson NOT fetched
- [x] 3.5 Changed lesson (digest differs) is fetched and applied
- [x] 3.6 --dry-run writes nothing and still reports the plan
- [x] 3.7 Conflict default → skipped-conflict with remediation command; --force → overwrite
- [x] 3.8 Partial failure → exit code 1, full report still emitted
- [x] 3.9 Locked-module lessons excluded with a reason

#### Manual
- [ ] 3.10 Real sync --all against local API populates project in correct order
- [ ] 3.11 Re-run after no change → all unchanged, zero downloads
- [ ] 3.12 Edited skill → reported skipped with copy-pasteable get command that takes the update
- [ ] 3.13 --json is stdout-only and well-formed; human report stderr-only

### Phase 4: Tests & docs

#### Automated
- [ ] 4.1 Full suite passes in both repos (bun test / pnpm test)
- [ ] 4.2 Build + binary build pass
- [ ] 4.3 Lint + typecheck pass in both repos

#### Manual
- [ ] 4.4 README reflects observed sync behavior (flags, report, exit codes)
- [ ] 4.5 delivery-api contract matches deployed catalog response
