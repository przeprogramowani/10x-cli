---
date: 2026-06-16T00:00:00Z
researcher: mkczarkowski
git_commit: b52b1be6cc71c3f7beb9e8d86db39ce49562dbd7
branch: master
repository: 10x-cli
topic: "Bulk download of all lessons + updating already-downloaded artifacts + verifying what changed upstream"
tags: [research, codebase, cli, manifest, writer, api-content, sync, bulk-update, backend, 10x-toolkit, catalog, contentHash]
status: complete
last_updated: 2026-06-20
last_updated_by: mkczarkowski
last_updated_note: "Added follow-up backend research (10x-toolkit delivery API + content pipeline). Merged the duplicate `cli-update-all` change into this one."
---

# Research: Bulk download / update / "what changed" for 10x-cli

**Date**: 2026-06-16
**Researcher**: mkczarkowski
**Git Commit**: b52b1be6cc71c3f7beb9e8d86db39ce49562dbd7
**Branch**: master
**Repository**: 10x-cli

## Research Question

An evangelist reports two related gaps in 10x-cli:

1. There is no way to **download all modules and lessons at once**, nor to
   **update artifacts already downloaded**. Doing a full refresh today means
   manually running `list m0`, `list m1`, … then `get m0l1`, `get m0l2`, … lesson
   by lesson (they scripted exactly that with an agent + `--no-course-rules`).
2. Many skills have been **updated since the course started**, and there is
   currently **no way to verify what changed**.

They ask for "an automat in the CLI for this operation." This research maps what
exists today, names the precise gaps, and proposes a concrete command design.

## Summary

**The feature is feasible and mostly sits on top of machinery that already
exists** — but with one hard constraint that shapes the whole design.

Key findings:

1. **The manual `list m0 / list m1 / …` loop is unnecessary.** `10x list` with no
   argument already calls `/api/catalog/:course`, which returns **all unlocked
   lessons across all modules in a single response** (`catalog.lessons`).
   Locked-module lessons are deliberately omitted from that array. So enumeration
   of "everything fetchable" is already a one-call operation.
   ([list.ts:46-48](src/commands/list.ts), [api-content.ts:104-113](src/lib/api-content.ts))

2. **Re-apply is already safe and idempotent.** `applyBundle()` does three-way
   SHA-256 conflict detection: a clean upstream change is applied, an unchanged
   file is left alone, and a user-edited file triggers the conflict resolver
   (which **defaults to `skip` in non-TTY / pipeline mode** — user work is never
   silently destroyed). A bulk "update everything" loop inherits all of this for
   free. ([writer.ts:445-464](src/lib/writer.ts), [conflict-prompt.ts:4-40](src/lib/conflict-prompt.ts))

3. **The manifest already stores per-file content hashes** (SHA-256) for skills
   and prompts — this is the substrate for a "what changed" report.
   ([manifest.ts:20-22, 24-29](src/lib/manifest.ts))

4. **HARD CONSTRAINT — the manifest alone cannot tell you upstream changed.** The
   stored hash is the hash of the *last-downloaded content*. The API bundle
   carries **no etag / version / revision**, the catalog endpoint exposes **no
   per-lesson hash**, and there is **no conditional-request (`If-None-Match`)
   support**. Therefore detecting "did this skill change upstream?" **requires
   re-fetching the full lesson bundle** and comparing `contentHash(bundle.content)`
   against the stored manifest hash. A sync is inherently an N×-fetch loop, one
   HTTP round-trip per lesson, with no cheap "has anything changed?" pre-check.
   ([api-content.ts:83-93](src/lib/api-content.ts), [api-types.ts](src/generated/api-types.ts))

5. **Change visibility is limited to skills + prompts.** Configs are **not
   hashed** (skip-on-exists only) and rules are **not manifest-tracked** at all
   (sentinel-block managed). A "what changed" report cannot cover configs or
   rules without new mechanism. ([writer.ts:324-331, 279-321](src/lib/writer.ts))

6. **This is greenfield.** A bulk/update/sync command was never proposed,
   deferred, or ruled out. The cumulative-manifest work deliberately kept
   `lessons` + per-lesson `appliedAt` to "future-proof `10x status`" — exactly the
   foundation a sync/diff command needs.
   ([cumulative-manifest/plan-brief.md:26](context/archive/2026-05-27-cumulative-manifest/plan-brief.md))

**Bottom line:** a `10x sync` command = `fetchCatalog` → filter to unlocked
lessons → loop `fetchLesson` + `applyBundle` per lesson → aggregate the per-file
actions into a single change summary. The risky parts (clobbering user edits,
cross-lesson deletion) are already solved. The new work is: multi-lesson
orchestration, partial-failure handling, an aggregate change report, and a
read-only "preview/diff" mode.

## Detailed Findings

### Area 1 — Enumeration: the catalog already lists everything

`10x list` (no module arg) calls `fetchCatalog(course, token)` which hits
`GET /api/catalog/:course` ([list.ts:46-48](src/commands/list.ts),
[api-content.ts:104-113](src/lib/api-content.ts)).

`CatalogResponse` ([api-content.ts:37-41](src/lib/api-content.ts)) is:

```ts
{ course: string; modules: ModuleSummary[]; lessons: LessonSummary[] }
```

- `lessons` is a **flat array spanning all modules**, each item keyed to a module
  only by `lesson.module: number`. There is **no per-lesson `state`/`locked`
  field** — lock status lives on `modules[].effectiveState`
  (`"locked" | "unlocked"`, [api-content.ts:18-24](src/lib/api-content.ts)).
- **Locked-module lessons are omitted** from `catalog.lessons`. Confirmed by the
  test fixture: a locked module 3 has zero entries in `lessons[]` and the CLI
  asserts `lessonCount === 0` for it (`tests/list-command.test.ts:126-180, 406`).
  Contrast: `/api/modules/:course/:module` *does* return lesson rows for locked
  modules, but the CLI blanks them in `renderModuleDetail` to avoid leaking
  titles ([list.ts:194-227](src/commands/list.ts)).

**Implication:** to enumerate everything fetchable, one `fetchCatalog` call is
enough; iterate `catalog.lessons`. To explain *why* something was skipped, read
`catalog.modules[].effectiveState`. The evangelist's per-module `list mN` loop
duplicates data already in the single catalog call.

### Area 2 — The manifest: what is stored (and what is not)

Defined in [manifest.ts:38-59](src/lib/manifest.ts), `MANIFEST_VERSION = 3`,
stored at `<manifestDir>/.10x-cli-manifest.json`.

- **`lessons: Record<string, LessonFilesEntry>`** ([manifest.ts:31-36](src/lib/manifest.ts))
  records per-lesson ownership: `appliedAt` (ISO-8601) + the skills/prompts/configs
  that lesson owns. `Object.keys(manifest.lessons)` enumerates every applied
  lesson — **this is the iteration set for an "update what I already have" sweep.**
- **`files`** is a recomputed **union** of all lesson entries
  ([buildUnionFiles, manifest.ts:158-182](src/lib/manifest.ts)); it carries the
  content hashes.
- **Content hashes** ([manifest.ts:20-22](src/lib/manifest.ts)): `SHA-256` hex over
  the raw UTF-8 string content, no normalization. Both sides hash identically
  (bundle content on write, `readFileSync(path,"utf8")` on read), so they are
  directly comparable.
  - Skills → `files.skills[name].contentHashes[relPath]`
  - Prompts → `files.promptHashes["<name>.md"]`
  - **Configs: NOT hashed** (skip-on-exists only, [writer.ts:324-331](src/lib/writer.ts))
  - **Rules: NOT manifest-tracked** (sentinel-block managed, [writer.ts:279-321](src/lib/writer.ts))
- **No per-artifact upstream version / etag / revision is stored** — only the
  content hash of the last applied content. The hash *is* the only fingerprint of
  "what was last downloaded."

### Area 3 — The CRITICAL constraint: detecting upstream change requires a fetch

There are two distinct questions:

**(A) "Does local on-disk content differ from what I last downloaded?"** —
answerable **offline**. Read the file, hash it, compare to the stored manifest
hash. This is exactly `localHash === storedHash` at
[writer.ts:458-460](src/lib/writer.ts). (Skills + prompts only.)

**(B) "Did the latest upstream content change since I downloaded it?"** — **NOT
answerable without re-fetching.** The manifest holds only the last-downloaded
hash; the `LessonBundle` from the API ([api-content.ts:83-93](src/lib/api-content.ts))
carries no version/etag/hash on the bundle envelope, and `GET /api/catalog`
exposes no per-lesson hash. A grep of the generated OpenAPI types for
`etag|version|modified|revision|since|if-none-match|last-modified` finds only a
per-artifact `contentHash?` **inside the full lesson-bundle response**
([api-types.ts:116/122/128/134](src/generated/api-types.ts)) — not on the cheap
catalog. There is also **no bulk/diff endpoint** (only a per-lesson `/download`
ZIP variant the CLI never calls).

**Consequence:** to report "this skill changed upstream," you must download the
bundle and compute `contentHash(bundle.content) !== storedHash`. A sync is an
N×-fetch loop; there is no way to skip unchanged lessons before downloading them.

With a fetched bundle, a full three-way state per file is computable (mirroring
[computeFileAction, writer.ts:445-464](src/lib/writer.ts)):

- `storedHash` = last downloaded (manifest)
- `localHash` = on disk now (re-hash file)
- `upstreamHash` = `contentHash(bundle.content)` (re-hash fetch)

Then: `upstreamHash !== storedHash` ⇒ **upstream changed**;
`localHash !== storedHash && localHash !== upstreamHash` ⇒ **user edit / conflict**;
`localHash !== storedHash && localHash === upstreamHash` ⇒ already up to date.

### Area 4 — The writer: re-apply safety is already solved

The full decision table in [computeFileAction (writer.ts:445-464)](src/lib/writer.ts):

| File exists? | local == bundle? | storedHash? | local==stored? | action | isConflict | Meaning |
|---|---|---|---|---|---|---|
| No | — | — | — | `created` | false | new file |
| Yes | yes | — | — | `unchanged` | false | no change |
| Yes | no | yes | yes | `updated` | false | clean upstream update |
| Yes | no | yes | no | `updated` | **true** | user-edit conflict |
| Yes | no | no (v2/untracked) | — | `updated` | **true** | one-time calibration conflict |

Final per-file action values ([writer.ts:47-55](src/lib/writer.ts)): `created`,
`updated`, `unchanged`, `skipped`, `removed`, `conflict_overwritten`,
`conflict_saved_user`, `conflict_skipped`.

- The `ConflictResolver` ([conflict-prompt.ts:4-40](src/lib/conflict-prompt.ts))
  returns `"overwrite" | "save_user" | "skip"`; **non-TTY → `skip`
  unconditionally** ([conflict-prompt.ts:8](src/lib/conflict-prompt.ts)).
  `conflict_skipped` deliberately keeps the old stored hash so the conflict
  re-triggers next time ([writer.ts:213,267](src/lib/writer.ts)).
- **`--dry-run` already computes identical actions without writing** — every fs
  mutation is behind a `!dryRun` guard, and the full `WriteResult` is returned
  regardless ([writer.ts:201-362,432-438](src/lib/writer.ts)). So a `get
  --dry-run` is *already* a per-lesson "what would change" preview.
  - **Caveat:** in TTY mode `onConflict` is `await`ed *before* the dry-run guard
    ([writer.ts:189-197](src/lib/writer.ts)), so a TTY dry-run would interactively
    prompt even though nothing is written. A clean preview needs a non-prompting
    resolver injected (or non-TTY, which auto-skips).
- Cross-lesson deletion is already prevented: `computeRemovals` is scoped to the
  current lesson and protects files owned by other lessons
  ([writer.ts:498-600](src/lib/writer.ts)).

### Area 5 — What is missing for a bulk command

Reusable as-is:

- `fetchCatalog` + `fetchLesson` (with mandatory bundle-signature verification —
  do **not** bypass these wrappers), `applyBundle`, `createConflictResolver`,
  `readManifest`, `resolveToolProfile`, `readToolConfig`/`updateToolConfig`.
- The cumulative, per-lesson manifest as the iteration set + change baseline.
- `requireAuth(ctx)` called **once** covers the whole batch (handles refresh +
  cross-process lock) ([auth-guard.ts:119](src/lib/auth-guard.ts)).

Needs building:

1. **Multi-lesson orchestration.** `applyBundle` is strictly single-bundle and
   `get.ts` does one fetch per invocation. A sync must loop, calling `applyBundle`
   per lesson (the cumulative manifest accumulates correctly across calls).
2. **An aggregate change summary.** Nothing today produces "3 changed upstream,
   1 user-edited, 5 unchanged." The `counts` in [get.ts:513-520](src/commands/get.ts)
   are artifact-bucket sizes, **not change tallies**. The classification must be
   derived from per-file actions (`created`+`updated` = applied upstream change;
   `conflict_*` = user-edited; `unchanged`; `removed`).
3. **A read-only preview without consuming the resolver.** `computeFileAction` is
   module-private and there is no exposed `{action, isConflict}` signal. The
   cleanest enabler is a new exported `planBundle()` (or exporting
   `computeFileAction`) that returns per-file actions + conflict flags **without
   invoking `onConflict` and without writing** — this powers a `--dry-run`/diff
   mode that never prompts.
4. **Partial-failure handling.** `handleLessonError` calls `process.exit`
   ([get.ts:385-468](src/commands/get.ts)); reused directly it would abort the
   whole sweep on the first 403/404/network error. Sync needs its own accumulator
   that records per-lesson outcomes and emits **one** aggregate envelope at the
   end.
5. **Concurrency / rate-limit policy.** `api-client.ts` has **no retry, no
   client-side rate-limiting, no concurrency control**; a `429` surfaces as
   `code: rate_limited` and bubbles up ([api-client.ts:109](src/lib/api-client.ts)).
   A bulk loop should be **sequential or a small bounded pool**, and thread a
   single shared `AbortSignal` so Ctrl-C cancels the batch (per-call 30s timeout
   already exists, [api-client.ts:84,163](src/lib/api-client.ts)).

### Area 6 — Historical context (from prior changes)

- **Bulk/update/sync was never proposed, deferred, or ruled out** in any archived
  change, the README, or the CHANGELOG. This is open design space.
- The only adjacent decisions: a `--keep`/`--no-cleanup` flag was **explicitly
  rejected** ([content-overwrite/research.md:208-210](context/archive/2026-05-27-content-overwrite/research.md)),
  and a `10x clean` command was **deferred as future work**
  ([cumulative-manifest/plan.md:35](context/archive/2026-05-27-cumulative-manifest/plan.md)).
  The team's instinct was **structural over flag-based** — a sync feature should
  follow that taste and lean on the manifest model.
- The **cumulative manifest** ([cumulative-manifest/change.md:17](context/archive/2026-05-27-cumulative-manifest/change.md))
  was built to fix cross-lesson data loss, but deliberately kept `lessons` +
  per-lesson `appliedAt` to **"future-proof `10x status`"**
  ([cumulative-manifest/plan-brief.md:26](context/archive/2026-05-27-cumulative-manifest/plan-brief.md))
  — the exact foundation for a status/diff/sync command.
- **User-edit-protection / content-overwrite** ([user-edit-protection/change.md:18-21](context/archive/2026-05-27-user-edit-protection/change.md))
  established the three-way hash detection and non-TTY skip-default. A bulk update
  **inherits safe re-apply for free** — the hard part of "update without
  destroying work" is done.
- The **master design plan** referenced by CLAUDE.md
  (`thoughts/shared/plans/2026-04-07-10x-cli-design.md`) is **NOT present in this
  repo** — it lives in the sibling `10x-toolkit` repo. Before finalizing, confirm
  there whether a bulk/update command was already slotted into a later phase.

## Proposed Design (state + gap → recommendation)

A single new command, `10x sync`, plus a small writer refactor to enable a
non-prompting preview.

### Command shape

```
10x sync [--dry-run] [--module mN] [--course <slug>] [--tool <tool>]
         [--lang <lang>] [--no-course-rules] [--json] [--verbose]
```

Two complementary modes (driven by whether a manifest exists / by intent):

- **Update mode (default):** for every lesson in `Object.keys(manifest.lessons)`,
  re-fetch and re-apply, accumulating a change report. This directly answers
  "update already-downloaded artifacts" + "what changed."
- **Full-download mode (`--all`, or sync with no manifest):** enumerate
  `catalog.lessons` (unlocked only), fetch + apply each in module/lesson order.
  This answers "download all modules and lessons at once."

`--dry-run` makes it a **read-only diff**: report what changed upstream and what
would conflict, write nothing. This is the "verify what changed" answer.

### Algorithm

1. `requireAuth(ctx)` once; `resolveContext(options)`; `resolveToolProfile`.
2. `fetchCatalog` → build the unlocked-lesson set. For update mode, intersect with
   `Object.keys(manifest.lessons)`; for full mode use all unlocked lessons.
   Record locked/excluded lessons with reasons (from `effectiveState`).
3. **Sequentially** (or bounded pool) for each lesson: `fetchLesson` (keeps
   signature verification) → classify per file via the new read-only planner →
   if not dry-run, `applyBundle` with the standard conflict resolver.
4. Accumulate per-lesson outcomes; never `process.exit` mid-loop. Map per-file
   actions to a summary: `upstream-updated`, `created`, `unchanged`,
   `user-edited` (`conflict_*`), `removed`, plus per-lesson fetch errors.
5. Emit **one** aggregate envelope (human table + JSON `{ lessons: [...],
   totals: {...} }`) and choose an exit code from the worst outcome
   (`0` clean / `1` if any fetch errored / unchanged still `0`).

### Required refactor

Export a pure, non-mutating planner from the writer — e.g.
`planBundle(bundle, projectRoot, { profile }): WritePlan` — that returns per-file
`{ path, action, isConflict, upstreamChanged }` **without** invoking `onConflict`
and **without** writing. `applyBundle` would consume the same planner so behavior
can't drift. This powers `--dry-run` diff without the TTY-prompt caveat and gives
sync its change classification. ([writer.ts:445-464](src/lib/writer.ts))

### Known limitations to document for the user

- "What changed" covers **skills and prompts only** — configs aren't hashed and
  rules aren't manifest-tracked, so changes to those cannot be reported by hash.
- Every sync **re-downloads every targeted lesson** (no server-side change check);
  expect N HTTP round-trips. A future server-side etag/`If-None-Match` or a
  catalog-level per-lesson hash would make this cheap — worth raising with the
  backend team (sibling `10x-toolkit` repo).

## Code References

- `src/commands/list.ts:46-48` — `list` (no arg) → `fetchCatalog` (full catalog in one call)
- `src/commands/list.ts:138-156, 194-227` — catalog/module rendering; locked-module blanking
- `src/lib/api-content.ts:37-41` — `CatalogResponse` (flat `lessons[]`, no per-lesson state)
- `src/lib/api-content.ts:83-93` — `LessonBundle` (no version/etag on the envelope)
- `src/lib/api-content.ts:104-149` — `fetchCatalog` / `fetchLesson` wrappers (+ signature verify)
- `src/lib/manifest.ts:20-22` — `contentHash` (SHA-256 over raw UTF-8)
- `src/lib/manifest.ts:24-36, 38-59` — manifest schema, `LessonFilesEntry`, `lessons` record
- `src/lib/manifest.ts:158-182` — `buildUnionFiles`
- `src/lib/writer.ts:445-464` — `computeFileAction` (three-way detection; module-private)
- `src/lib/writer.ts:47-55` — full `ArtifactAction` union
- `src/lib/writer.ts:189-197, 201-362` — conflict await + dry-run guards
- `src/lib/writer.ts:498-600` — `computeRemovals` (lesson-scoped, protected set)
- `src/lib/conflict-prompt.ts:4-40` — `ConflictResolver`, non-TTY skip default
- `src/commands/get.ts:385-468` — `handleLessonError` (calls `process.exit` — must not be reused raw in a loop)
- `src/commands/get.ts:497-522` — JSON envelope + `counts` (bucket sizes, not change tallies)
- `src/lib/api-client.ts:84,109,163` — 30s timeout, `rate_limited` mapping, no retry/concurrency
- `src/lib/auth-guard.ts:119` — `requireAuth` (call once per batch)
- `src/index.ts:4-29` — command registration wiring + unknown-option → exit 2
- `src/generated/api-types.ts:7,74,116,173,255,323,382` — endpoint catalog; per-artifact `contentHash` only inside bundle; no etag/diff/bulk
- `tests/list-command.test.ts` + `tests/helpers/api-content-mock.ts` — test harness to copy for a sync command

## Architecture Insights

- **The catalog is the cheap enumeration primitive; the bundle is the only change
  oracle.** Lock status and lesson lists are cheap (one catalog call); actual
  content change can only be known by downloading the bundle and re-hashing.
- **Hashes are local-only fingerprints, not upstream revisions.** Everything
  about change detection follows from this: it's a fetch-then-compare model, not a
  conditional-GET model.
- **Re-apply is intentionally idempotent and pipeline-safe.** The non-TTY
  skip-default and lesson-scoped removals mean a bulk loop is safe by
  construction — the design risk is orchestration/UX, not data safety.
- **`updated` is overloaded** (clean update vs. pre-resolution conflict); the
  conflict distinction only becomes visible after the resolver runs. A read-only
  planner that surfaces `isConflict` directly removes this ambiguity for reporting.

## Historical Context (from prior changes)

- `context/archive/2026-05-27-cumulative-manifest/` — cumulative manifest;
  `lessons` + `appliedAt` kept to future-proof `10x status` (the sync foundation).
- `context/archive/2026-05-27-user-edit-protection/` — three-way hash detection,
  non-TTY skip-default (safe re-apply inherited by sync).
- `context/archive/2026-05-27-content-overwrite/` — `--keep` flag explicitly
  rejected in favor of structural fix.
- `context/archive/2026-06-02-disable-course-rules/` — `--no-course-rules` /
  persisted `courseRules` config; sync must honor the same tri-state resolution.

## Related Research

- None under `context/changes/**/research.md` yet (this is the first change in
  `context/changes/`). Prior research lives only in `context/archive/**`.

## Open Questions

1. **Does the sibling `10x-toolkit` master plan
   (`thoughts/shared/plans/2026-04-07-10x-cli-design.md`) already scope a
   bulk/update command or a `10x status`?** Must be checked there — not present in
   this repo.
2. **Server-side cheap change check.** Should we ask the backend team to add a
   per-lesson `contentHash`/`updatedAt` to the catalog response, or
   `If-None-Match` support on `/api/lessons/...`? That would turn an N×-download
   sync into an N×-cheap-check + download-only-changed. This is the single biggest
   efficiency lever and is a backend (10x-toolkit) decision.
3. **Update scope default.** Should `10x sync` default to updating *only
   already-applied* lessons (`manifest.lessons`) or to downloading *all unlocked*
   lessons? (Recommendation: update-applied by default, `--all` for full
   download.)
4. **Config/rules change visibility.** Out of scope for a hash-based report. Do we
   want to start hashing configs (and possibly tracking the rules block) so future
   syncs can report those too?
5. **Exit-code semantics for a partial batch** (some lessons updated, one network
   error) — needs a defined policy consistent with `ExitCodes`.

---

## Follow-up Research 2026-06-20 — the backend side (10x-toolkit)

The original research (above) deliberately deferred the backend to **Open Question 1
& 2**: it concluded the CLI must do an N×-download sync because the *catalog* carries
no per-lesson change signal, and flagged "ask the backend team whether a cheap
change-check can be added" as the single biggest efficiency lever. This follow-up
answers that by reading `10x-toolkit/packages/api` (delivery worker),
`packages/course-content` (build/transform pipeline) and `packages/ai-artifacts`
(source content). It updates the recommendation and resolves Open Questions 1, 2, 4.

This change was investigated under the throwaway id `cli-update-all`; that folder has
been **merged into `bulk-sync-update`** (this one) — same work, started ~Jun 16 and
picked back up Jun 20. The feature spans **two repos** (`10x-cli` + `10x-toolkit`).

### Headline finding — a per-artifact content hash ALREADY EXISTS in published bundles

The earlier research said "the manifest hash is a local-only fingerprint; the API
bundle carries no version/etag." That is true of the *envelope and the catalog*, but
**not** of the published artifacts. The content pipeline already computes a SHA-256
per artifact and bakes it into the bundle JSON served from R2:

- The TypeScript build (`buildLessonBundle`,
  `packages/course-content/src/build/core.ts:122-158`) does **not** set `contentHash`
  — which is why a naive read of the bundle builder (and Open Question framing) missed
  it. But a **second, post-build CI step** does:
- `packages/course-content/scripts/transform-content.mjs:100-101` computes
  `sha256(SYSTEM_PROMPT_VERSION + ":" + content)` per artifact (skill `SKILL.md`,
  prompt, rule), uses it to cache LLM "universalization"/translation, and **writes
  `contentHash` into the bundle JSON** (`transform-content.mjs:366-374, 410-419`).
- The schema already has the slot: `namedContentSchema` / `skillBundleSchema` declare
  optional `contentHash` (`packages/course-content/src/schemas/bundle.ts:6-8, 20-21`),
  and the CLI's generated types already see it on the lesson bundle artifacts
  (`src/generated/api-types.ts:116,122,128,134`).
- CI publishes by overwriting the R2 objects in place
  (`10x-toolkit/.github/workflows/ci.yml:276-306`, `wrangler r2 object put --remote`).

So the published bundle for every lesson **already contains a stable-ish per-artifact
hash** — it's just buried inside the *full lesson bundle*, the exact thing a cheap
"what changed" pre-check wants to avoid downloading.

**Caveat that shapes the design:** that hash mixes in `SYSTEM_PROMPT_VERSION`
(`transform-content.mjs:98`) and is computed on the *transformed* artifact, so it
varies with the prompt version and potentially per language variant
(`{lessonId}.json` vs `{lessonId}.pl.json`). It is a fingerprint of "published
content as transformed," not of raw source — which is fine for change detection
(that's exactly what a learner wants: "did what I'd download change?") as long as the
hash we expose corresponds to the variant the CLI fetches.

### Delivery API: per-endpoint change-detection audit

The API is a Hono Cloudflare Worker (`packages/api/src/index.ts:39-56`), all delivery
routes JWT-guarded, reading content **live from R2** (`COURSE_10X3_CONTENT_BUCKET`)
on every request — no in-memory cache, no R2 metadata read.

| Endpoint | Returns | Change signal today | Conditional req. |
|---|---|---|---|
| `GET /api/catalog/:course` (`catalog.ts:30-31`) | `{course, modules[], lessons[{lessonId,module,lesson,title,summary,bundlePath,availableLanguages?}]}` (`catalog.ts:14-27`) | **none** — only `releaseAt` (release schedule, not content mtime) | none |
| `GET /api/modules/:course[/:module]` (`modules.ts:30,57`) | enriched modules; single-module adds `lessons[{lessonId,lesson,title,summary,availableLanguages}]` (`modules.ts:14-24`) | **none** beyond `releaseAt` | none |
| `GET /api/lessons/:course/:lessonId` (`lessons.ts:20-22`) | full `bundleSchema` (`bundle.ts:41-51`): skills/prompts/rules/configs, each with optional `contentHash` | per-artifact `contentHash` **inside the bundle**, plus `X-Bundle-Content-Hash` header (see below) | none |
| `GET /api/lessons/:course/:lessonId/download` (`download.ts:23-25`) | ZIP or raw markdown | **none** (doesn't even sign) | none |

Two hashes exist server-side and must not be conflated:

1. **`X-Bundle-Content-Hash` response header** (`lessons.ts:153-161`, `signing.ts:23-27,37`)
   — SHA-256 of the *entire post-transform JSON response body*, emitted only when
   `BUNDLE_SIGNING_KEY` is set, for **tamper verification** (Ed25519 signing). It is
   computed **at request time** and **varies per `?tool=` and `?lang=` variant**, so
   it's not a stable per-lesson identity and reading it still costs a full bundle
   fetch + stringify. Not a viable cheap pre-check.
2. **Per-artifact `contentHash`** baked at build time (above) — the real reusable
   substrate, but only present inside the full bundle.

No endpoint supports `If-None-Match` / `If-Modified-Since` / a `since` param; grep for
`etag|If-None-Match|updatedAt|revision` across the API src returns nothing
(confirmed CLI-side too: none in `src/generated/api-types.ts`).

### Resolved: the smallest backend change (answers Open Q1 & Q2)

The earlier research's "ideal but expensive" wish — a catalog-level per-lesson hash —
turns out to be **cheap to ship**, because the hashes already exist at build time and
the catalog is built in the same run:

**Recommended (Option 1): surface a per-lesson digest on the catalog.**
1. `course-content` build: in `buildCatalog`
   (`packages/course-content/src/build/core.ts:160-183`) — which already has every
   built bundle in hand — compute a per-lesson digest (e.g.
   `sha256` over the lesson's ordered artifact `contentHash`es, or over the canonical
   bundle JSON) and write it onto each catalog lesson. Add `contentHash: z.string()`
   to `catalogLessonSchema` (`packages/course-content/src/schemas/catalog.ts:10-18`).
   This must run **after** `transform-content.mjs` populates artifact hashes, or
   recompute from the transformed bundles.
2. API: widen `enrichedCatalogSchema`
   (`packages/api/src/routes/catalog.ts:18-25`) to include `contentHash`. The handler
   already spreads `catalog.lessons` raw (`catalog.ts:79`), so the field flows through
   with no handler logic change.
3. CLI: `fetchCatalog` already returns the catalog in **one** call
   (`src/lib/api-content.ts:104-113`); add `contentHash?` to `LessonSummary`
   (`api-content.ts:27-35`) and `10x sync` compares it against the locally stored
   manifest hash, downloading **only** lessons whose digest moved.

**Net effect:** the N×-download sync from the original research collapses to **one
catalog GET + download-only-changed**. Both feature requirements — bulk download
(via existing `bundlePath`) and "what changed" (via the digest) — are satisfied by a
single new catalog field. This is the single highest-leverage change and it's small.

**Variant correctness (the one trap):** the digest published on the catalog must
match the variant the CLI will fetch. Options: (a) publish a single canonical/base
digest and accept that a `?tool`/`?lang` transform could differ — only acceptable if
the change-detection compares against a same-variant baseline; or (b) publish a small
map `contentHash` keyed by the variant axes the CLI actually uses. Given the CLI
fetches with `{tool, lang}` (`fetchLesson`, `api-content.ts:138-195`) and the manifest
stores per-file hashes of *what was written for that tool/lang*, the cleanest contract
is a **per-lesson digest over the base/Claude-Code variant** with the explicit
understanding that lang/tool-only differences are out of scope for the cheap check
(the existing three-way writer detection still catches them on actual download).

Alternatives, both strictly worse for a bulk sync (documented for completeness):
- **Option 2 — `If-None-Match`/ETag on the lesson endpoint** (`lessons.ts:151-184`):
  per-lesson, N round-trips, and to answer 304 cheaply you still need the hash without
  reading the body → pushes you back to storing it in the catalog or R2 custom
  metadata (no code reads R2 `.etag`/`.uploaded` today).
- **Option 3 — new `GET /api/manifest/:course`** returning `[{lessonId, contentHash}]`:
  functionally a subset of Option 1, extra route + registration
  (`index.ts:51-56`); only worth it to avoid widening the catalog payload.

### Course / module / lock-state definition (for the sync enumeration set)

- Course id is **`10xdevs3`**
  (`packages/course-content/src/courses/10xdevs3/index.ts:34-44`): module 0 = 1 lesson
  (`m0l1`); modules 1–5 = 5 lessons each (`m{N}l1..m{N}l5`).
- Per-module definition `{module, title, releaseAt, stateOverride}`
  (`packages/course-content/src/schemas/module.ts:3-8`; e.g.
  `courses/10xdevs3/module-01/index.ts:3-8`).
- Lock resolution: `resolveModuleState(releaseAt, stateOverride, now)`
  (`packages/api/src/lib/module-state.ts:3-11`) — `stateOverride` wins, else
  `releaseAt <= now ? unlocked : locked`; a runtime **KV override**
  (`stateOverride:${course}:${module}`) sits on top
  (`packages/api/src/routes/download.ts:109`). Catalog omits locked-module lessons
  (confirmed CLI-side in the original research); this is the enumeration set for
  `--all` full-download mode.

### Historical: bulk/sync is an explicit NON-GOAL in the master plan (important)

The master design plan the original research couldn't locate (it guessed
`thoughts/shared/plans/...`) is at
**`10x-toolkit/context/archive/2026-04-07-10x-cli-design/plan.md`** (the legacy
`thoughts/` dir was migrated to `context/` on 2026-04-29). It scopes only four v1
commands — `auth`, `get`, `list`, `doctor` — and the **"What We're NOT Doing"** section
explicitly lists:
- "Offline mode / local caching of lesson content" (`plan.md:62`)
- **"Background sync or auto-update of applied artifacts"** (`plan.md:63`)

So a `sync`/`update-all`/`status` command is **net-new scope that reverses a stated
non-goal** — worth a deliberate "yes, we're doing this now" decision in the plan, not
just an implementation detail. (Note: every other `sync`/`bulk` hit in 10x-toolkit
refers to **Circle membership sync** into KV — server-side, unrelated. Don't let the
word collide.) The per-lesson ZIP `download` endpoint
(`2026-04-12-10x-cli-expansion-wave1`) is the closest existing primitive and is still
one-lesson-per-call.

### Updated recommendation

The original `10x sync` design (update-applied-by-default, `--all` full download,
`--dry-run` read-only diff, `planBundle()` writer refactor) stands. The backend
research changes one thing and adds one coordination requirement:

1. **Pursue the catalog `contentHash` (Option 1) as part of this work**, not as a
   "future efficiency lever." It is small, the hash substrate already exists, and it
   converts the sync from "always re-download everything" into "show what changed for
   the price of one request, download only the deltas." Without it the CLI command
   still works but is an N×-download every time.
2. **This is a coordinated two-repo change.** Sequence: (a) `10x-toolkit`
   `course-content` build emits per-lesson `contentHash` → (b) `10x-toolkit` `api`
   catalog surfaces it → (c) regenerate `10x-cli`'s `src/generated/api-types.ts`
   against the updated `/openapi.json` → (d) build `10x sync` consuming it. The CLI
   command can ship first against the no-hash catalog (full re-download fallback) and
   gain the cheap pre-check once the backend field lands — so the two repos don't have
   to land atomically.

### Resolution of original Open Questions

1. **Master plan scope** → Resolved: found at
   `10x-toolkit/context/archive/2026-04-07-10x-cli-design/plan.md`; bulk/sync is an
   explicit non-goal, so this is a deliberate scope addition.
2. **Server-side cheap change check** → Resolved & recommended: add per-lesson
   `contentHash` to the catalog (Option 1). The hash already exists at build time;
   cost is ~one field. Strongly recommended to include in this change.
3. **Update scope default** → Unchanged recommendation: update `manifest.lessons` by
   default, `--all` for full unlocked download.
4. **Config/rules change visibility** → Still out of scope for a hash report (configs
   not hashed, rules sentinel-managed). The catalog digest covers skills+prompts; if
   we ever want config/rule change reporting, the per-artifact build hashes exist for
   those too and could be folded into the lesson digest later.
5. **Exit-code policy for partial batch** → Still open; a CLI plan-time decision.

### New backend code references

- `10x-toolkit/packages/course-content/scripts/transform-content.mjs:98,100-101,366-374,410-419` — build-time per-artifact `contentHash` (mixes `SYSTEM_PROMPT_VERSION`), written into bundle JSON
- `10x-toolkit/packages/course-content/src/build/core.ts:122-158` (`buildLessonBundle`, omits hash), `:160-183` (`buildCatalog`, where a per-lesson digest would be added)
- `10x-toolkit/packages/course-content/src/schemas/bundle.ts:6-8,20-21` — optional `contentHash` slot on artifacts
- `10x-toolkit/packages/course-content/src/schemas/catalog.ts:10-18` — `catalogLessonSchema` (add `contentHash` here)
- `10x-toolkit/packages/course-content/src/courses/10xdevs3/index.ts:34-44` — course/module/lesson map
- `10x-toolkit/packages/api/src/routes/catalog.ts:14-27,30-31,79` — catalog handler + `enrichedCatalogSchema` (widen here; already spreads lessons)
- `10x-toolkit/packages/api/src/routes/lessons.ts:151-184,153-161` — bundle assembly + `X-Bundle-Content-Hash` (request-time, variant-specific)
- `10x-toolkit/packages/api/src/lib/signing.ts:23-27,33-45` — `sha256Hex`/`signBundle` (integrity, not change-detection)
- `10x-toolkit/packages/api/src/lib/module-state.ts:3-11` — lock resolution
- `10x-toolkit/packages/api/src/index.ts:39-56` — route registration / JWT guard
- `10x-toolkit/.github/workflows/ci.yml:262-307` — transform + R2 publish pipeline
- `10x-toolkit/context/archive/2026-04-07-10x-cli-design/plan.md:57-67,582-586,1185-1296` — v1 command scope; bulk/sync as non-goal

### New open questions

6. **Where does the per-lesson digest get computed** — extend `buildCatalog`
   (TS, but it doesn't currently have transformed hashes) or the post-build
   `transform-content.mjs` (which does)? The hash must reflect the *transformed*
   published content, so the transform script (or a step after it) is the natural home.
7. **Variant policy for the published digest** — single base-variant digest vs. a
   per-`{tool,lang}` map. Needs a one-line contract decision before implementing the
   catalog field (see "Variant correctness" above).
8. **Do we relax the `BUNDLE_SIGNING_KEY` coupling?** The only request-time hash today
   is gated on signing; the catalog digest must be unconditional. (Option 1 sidesteps
   this — the digest is a published field, not a signing header.)
