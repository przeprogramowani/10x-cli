# 10xDevs 4 CLI Access — Implementation Plan

## Overview

Enable v4-only login and first-week `get m1lN` in 10x-cli and 10x-toolkit, choose the best available edition for new projects, preserve existing v3 projects/publication, support explicit recoverable v3-to-v4 project migration, and fix the reviewed access, membership and local-file hazards.

**Planning status**: recommendations prepared for user review; implementation has not started. The user explicitly requested the target behavior before implementation. Present the reviewed outcomes and incorporate the user's direction BEFORE starting Phase 1; this is the user-requested execution boundary, not a deployment checklist item deferred to Phase 7. Canonical cross-repo execution state lives at the bottom of this file.

## Current State Analysis

Fresh bases: CLI `origin/master=f89f195`, toolkit `origin/master=da989a6`. See research.md for paths and verified code. Event branch code was never deployed according to the user; no event user migration or expiry enforcement is needed. A different historical ZIP endpoint exists on toolkit master and is retired by this plan.

v4 membership provisioning exists, but login requires v3, CLI commands default to v3 and only v3 lesson definitions are built. Content has no per-course guard on master. The prior event guard fails open for unknown slugs; manual-to-Circle identity transition can erase another grant; recursive removal can delete local edits. Fresh inspection also found missing course propagation in get, mutations in preview modes and an upload-before-Worker deployment sequence.

## Desired End State

- A v4-only user logs in, runs `10x list 1`, downloads each `m1l1–m1l5`, and updates it with sync without specifying a course.
- New dual-owner projects select v4 when available; existing v3 projects keep v3. Explicit viewing of another entitled edition works; ordinary get/sync never switch editions. A dedicated migration previews and resolves changes across the whole project, creates a local backup, supports interrupted-operation recovery, and commits the v4 binding after successful application of currently unlocked replacements. Still-locked or unpublished replacements leave the installed v3 skills active and tracked as pending; later sync advances them as v4 unlocks.
- All supported access sources are evaluated through active membership grants. No access guessing, magic-link retries across audiences, granting v3 to v4 users or falling back on infrastructure failure.
- v3 published bytes remain unchanged during this rollout. Its source baseline is a pre-v4 cutoff with maintenance-only changes; v4 defaults to the latest published master sources and supports explicit per-file commit pins.
- Every content route enforces course access, and membership identity changes preserve independent grants.
- Print/dry-run do not mutate project/preferences; updates and profile migration preserve local/untracked files and consistent ownership.
- Both candidate repos and real-account rollout evidence establish the outcome. No Unaited flag, public event package, self-enrollment or expiry cleanup ships.

## What We're NOT Doing

- No merge of the Unaited branches and no event-user migration; no new manual-grant endpoint.
- No get-by-name/directSkills integration dependency; lesson delivery works from the current masters.
- No automatic edition migration, independent parallel v3/v4 update streams in one project, arbitrary edition downgrades, automatic semantic merge, or new general package framework. Explicit incremental v3-to-v4 migration, temporarily retained v3 artifacts under one v4 project binding, and rollback of each migration transaction are in scope.
- No rewriting the edu platform, Circle provisioning architecture or course weeks 2–5.
- No general publication platform, release garbage collector or membership storage migration. A minimal immutable v4 release layout is in scope so a migration can select one stable release. Preserve live v3 bytes; do not replace them with an assumed historical source snapshot.

## Implementation Approach

Use isolated clean-master worktrees in both repos and selective adaptation of reviewed ideas, not broad cherry-picks. Follow CSC: research → this plan → plan review → user outcome checkpoint → implement/test phases → implementation review → verified rollout → archive.

Recommended decisions:

| Decision | Recommendation | Reason / cost |
|---|---|---|
| First-week source | Independently copied current committed toolkit m1l1–m1l5; review edition-specific copy | Delivers existing useful artifacts immediately; acceptance includes curricular review |
| Course choice | Explicit request → project binding → backend default | Best new-project access without changing existing projects |
| Binding | Project-root .10x-cli.json plus consistent profile manifests | Project target edition stays distinct from recorded per-artifact source edition |
| Edition switch | Explicit whole-project migration with preview, conflict resolutions, backup and recovery | User-approved path from an existing v3 project to v4; ordinary updates keep their edition |
| Incremental replacement | Replace only unlocked v4 skills; retain the others active as v3-origin pending entries and retry through sync | User decision: no early access, automatic archival or waiting for all v4 weeks |
| Release consistency | Immutable v4 release prefix and current pointer; pin one release per operation | Prevents mixed-release get/sync/migration and permits publication rollback |
| V3 preservation | Freeze actual production prefix during rollout; pre-v4 source cutoff with maintenance-only changes | Latest v4 sources must never silently update v3 |
| Source revisions | Per-file full commit SHA overrides the course default; v4 defaults to latest master | Same artifact names, explicit exceptions and reproducible source selection |
| Security migration | Guard all routes, legacy claim reads live KV | Backward-compatible v3 access without permanent implicit grants |
| Reuse | Course-claim/guard/discovery concepts and small build loop | Fix reviewed defects; omit event and unrelated named-skill features |
| Deletion | Exact tracked unchanged files only; no recursive skill-directory deletion | Protect user edits, including inherited master paths |
| Rollout | Protected Worker first, v4 catalog last, CLI last | Closes the current exposure window |

## Critical Implementation Details

**Publication order**: current CI uploads before Worker deployment. A single ordinary merge containing new content and a new guard is unsafe. Preparation release must disable content publication before its changes land; guarded API verification is a prerequisite for the content release.

**Local state sequencing**: for an ordinary initial install, a project binding established only after writing is too late for partial failures. Verify remote data and local preflight first; write binding before the first project file change and preserve it after any partial write. Tool selection/migration must not occur before the course check.

**Account upgrade**: discovery reads live grants while a valid JWT may predate v4 purchase. Force one serialized refresh for this mismatch rather than silently choosing v3 or repeatedly retrying forbidden fetches.

**Migration scope**: All detected current and legacy profile manifests participate. Shared rules paths have one reconciled target, not one independent writer per profile. While a migration journal is active, every upgraded-CLI project-writing path blocks except its resume/rollback. Ordinary per-file updates retain their own safety contract; migration uses a dedicated transaction coordinator and never loops over forceful get calls.

**Scope of guarantees**: KV read-merge-write does not provide cross-isolate transactions; membership tests establish safe sequential identity transitions and retry recovery. Existing token revocation propagation remains up to 1h. File preflight does not claim immunity to malicious concurrent path replacement.

## Phase 1: Preserve membership across course and identity changes

**Repository**: Toolkit

### Overview

Fix the demonstrated loss of a v4 grant when the same email later enters Circle under another member ID. Use the existing per-course store; do not introduce event signup or a manual-grant API.

### Changes Required:

#### 1. Consistent identity merge and persistence

**Files**: `packages/api/src/services/circle-sync.ts` (`upsertCourseGrant`, `syncSpaceMembers`, `reconcileSpaceMembers`, `backfillMemberIdIndex`); `packages/api/src/routes/webhooks.ts`; `packages/api/src/services/email-drift.ts` (`planMigration`, `applyMigration`) and its reconcile callers.

**Intent**: Resolve the current normalized email record and member-ID record at write time rather than overwrite from a stale reconcile scan. Preserve all unrelated course/source grants, seed provenance and original grant times; migrate a synthetic/obsolete ID to the verified Circle ID and retire only the superseded reverse key.

**Contract**: Email hash normalization and the shared membership-record shape remain unchanged; `hasAccess` stays exactly the effective v3 mirror. Distinct real member IDs or an unrelated destination email record are an explicit collision: log a redacted diagnostic and skip mutation, never union potentially different people. A verified Circle email change for the SAME member ID remains a supported migration. For safe same-email identity promotion, the authoritative email record and new reverse record must be written successfully before removing the old reverse key. Re-running after each injected failure must repair the indexes without dropping courses. Reconciliation removals re-read and validate the current ID before deleting an email record.

Persist an additive recovery record at `email-migration:<memberId>` before any email-drift writes, containing version, member ID, old/new email hashes and start time. Reconcile checks pending recovery before deciding `no_drift`/`already_migrated`; it idempotently finishes the active email/reverse writes and old-email deactivation, and deletes the marker only after successful completion. Keep incomplete markers without an expiring TTL; conflicting new transitions pause for diagnosis. Recovery verifies member identity and merges current state rather than replaying stale grants. Backfill must never replace a verified active reverse record with a superseded/deactivated email tombstone, regardless of listing order.

#### 2. Source and lifecycle regressions

**Files**: `packages/api/src/__tests__/course-grants.test.ts`, `circle-sync.test.ts`, `webhooks.test.ts`, `email-drift.test.ts` and new `membership-identity.test.ts`.

**Intent**: Turn the manual-v4 → Circle-v3 reproduction into a permanent regression with fixtures using the existing manual source. Cover reversed course order, repeated backfill/reconcile, one-source revoke while another stays active, stale old-ID removal and identity collision. Include failed old-email deactivation after successful new-email/reverse writes, failed reverse write, recovery after process restart, and backfill with the old tombstone before AND after the active record. The manual source is tested without porting the event writer/endpoint.

**Contract**: These tests establish sequential preservation and retry behavior. KV is not a transaction system; no promise of serializable concurrent updates is made. Keep scheduled course reconciles sequential, avoid overlapping operator backfills, and expose detected divergence for repair by the existing reconcile path. Cross-isolate write serialization is a separate infrastructure concern, not silently claimed fixed by read-merge-write.

### Success Criteria:

#### Automated Verification:

- Membership lifecycle regression matrix passes: `pnpm --filter @przeprogramowani/api test --run`.
- Injected write failures followed by retry preserve unrelated grants, v3 mirror and consistent current reverse identity.

## Phase 2: Authorize every content path and expose available courses

**Repository**: Toolkit

### Overview

Separate authenticated identity from access to each course, allow v4-only login and expose server-recommended available editions. Close all access-map omissions before v4 objects can be uploaded.

### Changes Required:

#### 1. Shared course policy

**Files**: new `packages/course-content/src/course-registry.ts`; `packages/course-content/src/index.ts`; new `packages/api/src/middleware/course-access.ts`; `packages/api/src/index.ts`; handlers in `packages/api/src/routes/catalog.ts`, `modules.ts`, `lessons.ts`, `artifacts.ts`, `download.ts`.

**Intent**: Define lightweight metadata for v3 and v4 that both API and publisher consume, without importing lesson/artifact trees into the Worker. Plain Node publishing scripts consume the built course-content runtime export. Keep v3 API slug `10xdevs3` and v4 `10xdevs4`; canonical membership IDs remain `10xdevs-3` and `10xdevs-4`. The only accepted spellings in this release are each returned `id` and `slug`; normalize either to `slug` in BOTH authorization and handlers' R2/module-state keys, replacing raw-param lookups.

**Contract**: Registry entries have canonical ID, slug, the two accepted spellings, title, edition rank and publication policy (`frozen` v3 / `active` v4). Unknown slug is 404 BEFORE R2 access, even when an object with that prefix exists. Registered but unauthorized is 403 `course_access_denied`. Apply the policy to catalog, modules, lesson, artifact and ZIP/download routes; an automated route inventory must catch future content endpoints lacking authorization. Module release checks still apply after course authorization. The route matrix must prove the hyphenated spelling reaches the same catalog, lesson, artifact, ZIP and module-state override as its slug; discovery need not expose another aliases field.

#### 2. Login, callback, refresh and old tokens

**Files**: `packages/api/src/services/auth.ts`, `services/circle-sync.ts`, `routes/auth.ts`, `types.ts`, existing auth tests.

**Intent**: Accept any active grant for a registered course, regardless of whether its content has been published yet; re-check at verified callback and refresh. Mint strict canonical `courses: string[]` claims at every token site, including smoke-token tooling.

**Contract**: Keep existing login request, token response, JWT lifetime, rate limits and refresh rotation. No self-enrollment, grant writes or audience flag. Revoked/no-access identities do not obtain fresh tokens. Missing claims on legacy signed user tokens use a fresh KV membership lookup; malformed present claims are rejected and never treated as legacy. Bound normal token revocation staleness by the existing 1h token/refresh policy. Update seed/smoke tooling to include claims rather than depending on legacy inference.

#### 3. Live discovery

**Files**: new `packages/api/src/routes/me.ts`; `packages/api/contracts/auth-api.md`, `delivery-api.md`; new `packages/api/src/__tests__/me-courses.test.ts`.

**Intent**: Return all active registered grants with content availability, and recommend the highest-ranked available edition. This checks the supported access sources through the membership model, not repeated magic-link attempts.

**Contract**: `GET /api/me/courses` returns `{courses: [{id, slug, title, edition, available}], defaultCourse: slug | null}`. An absent or intentionally withdrawn catalog gives `available:false`; a valid catalog must advertise at least one currently unlocked lesson. Corrupt catalog, KV/R2 errors are explicit 5xx, never fabricated absence or downgrade. Unknown grants are ignored for CLI recommendations. Read live membership once and inspect only the small registered set for that user. Empty list/default null is valid for an existing token whose grants were revoked.

#### 4. Retire the separate historical event route

**Files**: `packages/api/src/index.ts`; `routes/unaited-csc.ts`; `lib/unaited-csc-access.ts`, `lib/unaited-csc-license.ts`, `lib/unaited-csc-readme.ts`; `routes/__tests__/unaited-csc.test.ts`; delivery contract.

**Intent**: Remove the expired public-event exception and the ZIP handler that directly reads v3 m0l2. An event-named endpoint must not become a back door for newly logged-in v4 accounts.

**Contract**: Retired path serves no content (404 under the standard routing/auth contract). Keep the existing v3 published m0l2 objects and normal entitled lesson access intact. No event-code migration, cleanup timer or local file deletion is introduced.

### Success Criteria:

#### Automated Verification:

- Auth and route matrix passes: `pnpm --filter @przeprogramowani/api test --run`.
- A populated unknown-course R2 fixture is denied for empty/v3/v4 claims across every content endpoint; retired event path never returns bytes.
- Legacy-token, malformed-claim, callback revocation, refresh and discovery outage tests pass.

## Phase 3: Publish v4 week one independently and freeze the live v3 publication

**Repository**: Toolkit

### Overview

Prepare a separate v4 first-week publication and make accidental v3 republishing impossible in normal production jobs. This phase builds/tests publishing capabilities; remote rollout happens only in Phase 7.

### Changes Required:

#### 1. V4 content definitions

**Files**: new `packages/course-content/src/courses/10xdevs4/index.ts`, `module-01/index.ts`, `module-01/lesson-01.ts` through `lesson-05.ts`; new `src/courses/index.ts`; `src/build/build-lessons.ts`.

**Intent**: Start with independently copied current committed m1l1–m1l5 definitions, preserve their cumulative structure, review v3-specific copy/rules, and resolve artifacts from the clean candidate toolkit source. This is the recommended initial curriculum baseline submitted for user review, not an assertion of a separately verified v4 syllabus.

**Contract**: Only module 1 and five lesson IDs enter the initial v4 catalog. Give v4 module 1 an already-effective release timestamp `2026-09-07T00:00:00+02:00`; remote KV override must not keep it locked. No v3 grant is conferred by v4 membership. Future modules require explicit v4 additions. Support default EN and PL publication through the existing transform pipeline and per-skill self-contained support-file invariant.

#### 2. Course-scoped pipeline

**Files**: `src/build/build-lessons.ts`; `packages/course-content/scripts/transform-content.mjs`, `validate-bundles.mjs`; `packages/api/scripts/r2-sync.mjs`; `packages/course-content/package.json`; root `package.json`; `scripts/dev-watch.mjs`; `packages/api/scripts/dev-seed.mjs`; `.github/workflows/ci.yml`, `.github/workflows/build-artifacts.yml`.

**Intent**: Pass a validated course selector end-to-end. Registry policy, not directory enumeration, decides the production upload set. Clean/rebuild only selected course output. Restore cache errors distinguish missing optional cache objects from auth/network failure.

**Contract**: Build/transform/validate and upload accept `--course 10xdevs4`; unknown selectors fail. Local/test builds may explicitly include frozen v3 fixtures, but production PUT planning rejects v3 even if its dist files are present or explicitly selected. Preparation release has publication disabled; content release enables only v4. Upload every lesson/language object, catalog and release manifest under a new immutable release prefix and verify success before switching the current pointer; incomplete publication cannot become the active release. CLI return codes must fail the job on upload/verification errors.

#### 3. V3 inventory and rollout backup

**Files**: new `packages/api/scripts/content-inventory.mjs`, corresponding tests and new `docs/how-to/release-10xdevs4-cli.md`.

**Intent**: Capture the actual published v3 key set and byte hashes, with a complete backup outside dist, before rollout. Re-read it after publication to prove no change. The old proposed source SHA is not used as a substitute for production bytes.

**Contract**: Paginate the complete prefix, download catalog and every language/lesson object, record SHA-256 and key inventory, and fail on any missing read/auth/network error. Proposed commands are `node packages/api/scripts/content-inventory.mjs snapshot --remote --course 10xdevs3 --output <backup-directory>` and `node packages/api/scripts/content-inventory.mjs compare --remote --course 10xdevs3 --baseline <backup-directory>/inventory.json`; compare exits nonzero on added/deleted/changed keys. The output directory is an operator-selected artifact location, never a placeholder source file. Backup is excluded from source control/dist/upload selection. Preserve live v3 in place; no delete/restore cycle in normal release. V4 uses the immutable release contract below; rollback selects a previously verified release instead of overwriting lesson objects.

#### 4. Course source defaults and per-file commit pins

**Files**: `packages/course-content/src/build/core.ts`, `src/build/build-lessons.ts`; new `src/build/source-revisions.ts`, source-resolution tests and course-specific source configuration alongside `src/courses/10xdevs3/index.ts` and `src/courses/10xdevs4/index.ts`; transform/cache handling in `packages/course-content/scripts/transform-content.mjs`.

**Intent**: Use one source-selection mechanism for both editions, without changing skill names or requiring Git access on the participant's machine. Course maintainers declare a default revision and optional file overrides in the toolkit repository. V4 uses `latest` by default; an override binds an exact artifact file to a full commit SHA until the override is changed or removed.

**Contract**: Precedence is exact file pin → course default. Override keys are canonical repository-relative artifact paths; reject traversal, paths outside the artifact root, duplicate/conflicting entries and nonregular files. Resolve `latest` once per build to the clean candidate master commit selected for publication, then use that full SHA for all unpinned inputs. It means the latest successfully published source revision available through the API, not an on-demand Git fetch by CLI. Read pinned files from isolated immutable Git trees; do not switch or mutate the operator's checkout. Invalid/unavailable commits and files absent at the selected commit fail the build; never silently fall back to latest.

Pinning `SKILL.md` pins only that file. References, scripts and templates retain their own pin or course default; maintainers must pin related files together when compatibility requires it. Validate the assembled skill's support-file references and existing self-contained bundle invariants. The same source file used by several lessons resolves consistently within the course build. Record course, resolved default SHA and each included file's resolved SHA and source hash in a build provenance manifest retained with release evidence. Cache identity includes the assembled source inputs and transform configuration/version, so a pin change cannot reuse stale transformed output. Pins bind source bytes; translations/transforms remain a separate versioned build input. Existing signed API bundles remain the CLI delivery boundary; no new client-side pin flag or unsigned content path is introduced.

V3 uses an explicit full-SHA baseline from before v4 plus deliberately reviewed maintenance changes, never the moving v4 default. The historical proposal `157667a30ad52169ba489d3dccc4bfc36ad530af` (2026-08-06) is only a candidate cutoff: verify the final v3 baseline against course history before selecting it. Selecting source revisions does not authorize rebuilding or replacing live v3 objects in this rollout. A subsequent v3 maintenance publication needs a separately scoped release with an explicit expected key/hash diff against the retained production inventory; normal v4 publication continues to reject all v3 PUTs.

#### 5. Minimal immutable v4 publication and release selection

**Files**: `packages/api/scripts/r2-sync.mjs`; new `packages/course-content/src/schemas/release.ts`, `packages/api/src/lib/content-release.ts`; schemas `catalog.ts`, `bundle.ts`; API routes `catalog.ts`, `modules.ts`, `lessons.ts`, `artifacts.ts`, `download.ts`, `me.ts`; `lib/lang-resolver.ts`, `lib/signing.ts`; API contracts/OpenAPI; CLI `src/lib/api-content.ts`, `api-client.ts`, generated types, `get.ts`, `list.ts`, `sync.ts`, `tests/helpers/api-content-mock.ts` and migration caller below. New files are relative to their package's existing source directories where applicable.

**Intent**: Add only the release primitive needed to fetch a stable course snapshot. R2 bucket remains private; authorized API routes resolve release objects and serve signed material. Existing v3 keys/routes retain their storage contract.

**Contract**: V4 object keys are `10xdevs4/releases/<releaseId>/catalog.json`, `manifest.json`, `migration-map.json`, and `lessons/<existing bundle filename>`. The per-course pointer `10xdevs4/current.json` has `{schemaVersion:1, releaseId, manifestHash}`. The release manifest records schema version, course, release ID, build source provenance, transform version/configuration, migration-map hash, and relative object keys with hashes/sizes for the catalog, migration map and all bundles. It excludes itself from its own hash inventory; the pointer contains its final byte hash. A release ID identifies final built outputs, not merely a Git commit, since pins/transforms may differ. Persist the exact staged outputs for retry; never overwrite an existing release object with different bytes.

The publisher uploads/validates the complete release, writes its manifest last, and changes `current.json` only after verification. Serialize every publish/rollback path for a course, including operator tools, and reject promotion if the expected current pointer changed; pin the conditional-write mechanism in implementation against the actual R2 API and test competing publishers. No GC in this release: retain published releases and abandoned uploads, so active downloads and recovery do not lose their selected objects. Rollback switches to a previously verified pointer; withdrawal makes current unavailable while preserving objects. Old publishing/deploy jobs remain stopped at the Phase 7 quiet boundary.

Catalog responses add `releaseId` and `releaseManifestHash` for v4. All catalog/module/lesson/artifact/ZIP endpoints accept the optional query `release=<releaseId>`; absent selects current, present selects exactly that course's retained release with no silent fallback. Resolve release once per request and pass a validated storage prefix through all handlers and language resolution. Validate identifiers and manifest object paths; never construct cross-course/arbitrary R2 reads from query input. All routes continue to enforce live course access and module release state, including requests for historical releases. A withdrawn current edition is unavailable through explicit historical selection as well; a locally staged rollback remains possible. Missing/corrupt selected release data is an explicit error, never a fallback to another release or course.

An operation fetches the catalog once and propagates its release ID to every dependent fetch, including all profiles and lessons; sync uses the same release for the entire sweep. API-signed bundle and artifact payloads include the selected course, release ID and release-manifest hash; Add this release metadata when constructing the signed API response, after loading the stored bundle/artifact; do not put the final manifest hash into objects hashed by that manifest, which would create a hash cycle. CLI verifies course, release ID and manifest hash against its operation selection before using bytes. The release's migration map is delivered through an authenticated API response covered by the existing signing mechanism, binding map hash, release ID and course; add a `GET /api/courses/{course}/migration-map?release=<releaseId>` route, route inventory and OpenAPI contract. Its map must not confer access to either course. Normal sync on a later invocation chooses latest published v4; installed release metadata is provenance, not a permanent project pin.

### Success Criteria:

#### Automated Verification:

- Scoped build succeeds: `pnpm --filter @przeprogramowani/course-content build && pnpm --filter @przeprogramowani/course-content build:lessons --course 10xdevs4`.
- Selected-bundle validation passes: `node packages/course-content/scripts/validate-bundles.mjs --course 10xdevs4`.
- Pipeline regression tests prove stray/modified v3 and unknown dist directories never enter transforms or production PUTs; incomplete uploads do not publish a catalog.
- Inventory tests cover pagination, full key/hash comparison and download failure; course-content tests pass: `pnpm --filter @przeprogramowani/course-content test`.
- Source-resolution tests prove latest is resolved once, per-file pins take precedence, unpinned sibling files follow the course default, missing pinned inputs fail, and provenance/cache identity reflect the assembled sources.
- Release tests prove incomplete uploads never become current, competing promotions do not overwrite each other, retained releases are immutable, and get/sync/migration read one selected release across every content route.


## Phase 4: Resolve the best available course and bind project writes safely

**Repository**: CLI

### Overview

Use one selection rule for get/list/sync, preserve the project's edition and make read-only operations genuinely free of project/configuration mutations.

### Changes Required:

#### 1. Discovery client and selection contract

**Files**: `src/lib/api-content.ts`, `api-client.ts`, `auth-guard.ts`; new `src/lib/course-selection.ts`; `src/commands/auth.ts`, `get.ts`, `list.ts`, `sync.ts`, `doctor.ts`; `src/generated/api-types.ts`, `scripts/generate-types.ts`.

**Intent**: Replace command-level v3 defaults with explicit flag → project binding → backend recommendation. Validate discovery response relationships and normalize either the returned `id` or `slug` to `slug`; no additional alias list is assumed. Show selected course and reason in human/JSON output; auth status/doctor can report access without pretending local token expiry alone establishes membership.

**Contract**: On a new project, v3-only selects v3, v4-only selects v4, both select published v4. Known unpublished v4 can legitimately leave v3 as recommendation; infrastructure errors cannot. A bound unavailable/revoked course fails explicitly with no fallback. If live discovery grants a selected course missing from a still-valid JWT, force one locked refresh and retry once; no loops, no cross-course retries. Missing discovery on an old backend yields a clear backend/CLI compatibility error rather than guessed v3. Preserve distinct `course_access_denied`, `module_locked`, `course_unavailable`, network/auth errors through all commands. Regenerate types from the candidate OpenAPI artifact, not whichever server happens to be production.

#### 2. Project binding and legacy manifests

**Files**: new `src/lib/project-course.ts`; `src/lib/manifest.ts`, `writer.ts`; `get.ts`, `sync.ts`; `tool-switch.ts`; README and CLI guide.

**Intent**: Use a small project-root `.10x-cli.json` binding (`version:1, course:<normalized API slug>`) across profiles, while retaining `manifest.course` as consistent install metadata. In an unbound project, inspect all known profile manifests before resolving a write; one consistent supported course becomes the legacy binding.

**Contract**: Unknown-version, corrupt or conflicting manifests cause a safe `course_binding_invalid`/conflict error before mutations; they do not mean empty project. For released v2/v3 manifests with v3, preserve v3 unless explicitly diagnosed: historical get --course could mislabel another course, so do not infer alternate content from filenames. Unmerged directSkills/schema-version-4 manifests are unsupported and block writes rather than being erased. The course edition number and manifest schema version are independent. Explicit different-course get/sync in a bound project fails `course_mismatch` with guidance to use the dedicated migrate command or a separate directory. Explicit read-only viewing of another entitled course is allowed. Only the Phase 5 migration coordinator can switch an existing project edition.

Validate auth, course availability, binding, payload/signature and planned paths before side effects. Atomically establish binding immediately before the first project mutation, not after files have already been written; retain it if I/O fails after writing starts. A rejected/fetch-failed operation must not create binding. Pass the resolved course to every `applyBundle` path, including the currently broken get call. Partial/filtered materialization must establish binding too, despite legacy partial apply not updating the full manifest.

#### 3. Separate profile selection from mutation

**Files**: `src/lib/tool-prompt.ts`, `tool-switch.ts`, `config.ts`; get/list/sync/doctor callers.

**Intent**: Resolve profile and course read-only first. Only a validated writing command may persist language/tool settings or offer profile migration. Cross-course orphan migration is denied before changing either profile.

**Contract**: `list`, `get --print`, `get --dry-run`, `sync --dry-run` and doctor preserve the project and preference files byte-for-byte, including TTY orphan/tool/lang combinations. Refresh-token rotation remains an explicit auth-store-only exception. Discovery/error reporting must not alter the project. No expiry hook exists.

### Success Criteria:

#### Automated Verification:

- Selection, legacy/corrupt/future/conflicting manifest and stale-token upgrade matrix passes in new course-selection/project-course tests.
- Snapshot tests prove read-only modes preserve project/preferences with TTY orphan migration, --tool and --lang; failed preflight creates no binding.
- Partial-write failure retains correct binding; get passes actual course to writer; CLI typecheck/tests pass: `bun run typecheck && bun test tests/*.test.ts`.

## Phase 5: Protect local edits during updates and profile migration

**Repository**: CLI

### Overview

Repair the underlying master deletion primitive rather than merely omit the event hook. Keep unrelated or locally changed files and accurate ownership through failures.

### Changes Required:

#### 1. Safe stale-file removal

**Files**: `src/lib/writer.ts`, `manifest.ts`, `tool-switch.ts`; new `src/lib/managed-removal.ts`; `tests/writer.test.ts`, `writer-plan.test.ts`, `tool-switch.test.ts`.

**Intent**: Share one deletion planner/executor for normal updates and explicit profile cleanup. Remove only regular, manifest-tracked, no-longer-owned files whose stored content hash matches current bytes. Prune only empty directories.

**Contract**: Preserve untracked files, missing-hash legacy files, modified files, adopted config templates and files still owned by another lesson. Neither recursive directory deletion nor `--force` can bypass this rule. Keep protected-set accounting and report `preserved_local` outcomes with a reason. Configs without reliable ownership hashes are retained; do not add unsafe inferred hashes. Modified orphan files become explicitly unmanaged/preserved after ownership removal, never a target for a later automatic sweep. Do not modify user-authored rule text outside the managed sentinel.

Validate every path component with lstat and containment before writes/removals/moves; reject symlinked roots, parents, targets and manifests, traversal and nonregular types. Failure must not report a removal that did not occur. This protects stable filesystem paths; hostile concurrent replacement of paths by another local process is not claimed solved by preflight alone.

#### 2. Migration ownership and sync freshness

**Files**: `src/lib/tool-switch.ts`, `writer.ts`, `manifest.ts`; `src/commands/sync.ts`.

**Intent**: Preserve course and ownership during tool changes; retain source tracking for skipped/failed files and create destination tracking only for successful transfers. Do not let catalog-digest shortcuts mask missing files or representation changes.

**Contract**: Same-course migration can proceed after preflight; a destination with another course fails unchanged. Partial migration retains both consistent ledgers; no source manifest deletion until all its managed ownership is transferred/retired. Shared root rules files must not lose a still-used sentinel. Sync skips only when upstream digest, requested language/tool representation and expected local tracked state agree; missing files trigger repair, local edits remain conflicts, and representation switches invalidate saved digest. Persist additive representation metadata and per-lesson installed release ID/manifest hash on compatible manifest schema v3; preserve older readability and conservatively refetch when metadata is absent. Do not import direct-skill schema or event package semantics.

#### 3. Explicit v3-to-v4 migration preview and material mapping

**Files**: new CLI `src/commands/migrate.ts`, `src/lib/course-migration.ts`, `src/lib/migration-plan.ts`, `tests/course-migration.test.ts`; command registration in `src/index.ts`; `project-course.ts`, `manifest.ts`, `tool-profile.ts`, `writer.ts`, `sentinel-migration.ts`; new toolkit `packages/course-content/src/courses/10xdevs4/migration-from-v3.ts` consumed by release build/map API above; CLI guide and README.

**Intent**: Implement the user's approved explicit migration, independent of ordinary get/sync and profile switching. Proposed commands: `10x migrate --to 10xdevs-4 --dry-run` for read-only preview; `10x migrate --to 10xdevs-4` for interactive preview/resolutions and final apply; `10x migrate --resume <id>` and `10x migrate --rollback <id>` for recovery. JSON/noninteractive mode must produce a reviewable plan and require explicit apply/resolution input; a generic force/yes flag cannot settle conflicts or turn unavailable targets into deletions.

**Contract**: Require a consistent v3 source binding (or consistent supported legacy manifests), active v4 entitlement and an available v4 release. A current v3 entitlement is not needed to inspect/back up the participant's local v3 files; remote v3 reads still require v3 access. Select one v4 release and fetch/verify the signed migration map and only currently unlocked replacement bundles for the needed profiles/languages before any target-file changes. Never prefetch locked lesson bodies for migration or staging. Map explicitly from source lesson/artifact identity to target identities when known; absence from the current map means pending mapping, never removal. Same lesson ID/skill name alone is not sufficient evidence. The map is authored/reviewed with the curriculum and versioned with the target release; metadata may identify a future target, but availability comes from current authorized module/lesson state and no map grants content access. Explicit retirement/rename information is distinguishable from temporary absence and must not delete a retained artifact without user resolution. Determine the target union per profile from installed material, using the reviewed map's explicit target lesson ordering and final rules source for cumulative lessons; compute one final desired file state rather than sequentially replaying all lessons as independent writes; do not pretend later v3 lessons have been migrated to unavailable v4 lessons. Different source baselines or unknown historical provenance must be shown rather than guessed; inability to establish safe ownership/hash for a replacement creates a conflict; retaining an untouched legacy file does not require inventing its historical hash or source commit. If the selected v4 course is available but none of the installed artifacts can yet be replaced, the explicit operation can still bind the project to v4 and record all source artifacts as pending.

Scan every `PROFILES` and `LEGACY_PROFILES` manifest, retain existing tool layouts, and preserve requested language. Do not combine a course migration with a profile rename/move. Multiple profiles sharing a root rules file must agree on the managed block or produce a conflict; apply that path once. Preview every path as unchanged/add/update/pending-v4/conflict/untracked-preserved, including shared rules and files without a v4 equivalent. Own/untracked files are never adopted, moved or overwritten automatically. Collisions require an explicit choice to preserve locally or use v4 after backup. Retain-local for a mapped file records the upstream hash separately from local bytes so later sync still detects the local divergence. Legacy missing hashes, managed rules with no reliable baseline hash (the current manifest stores no rules hash), configs with no reliable tracking and malformed/orphan sentinel blocks cannot be treated as safe replacements. Do not use the current sentinel repair that truncates unrelated text; preserve surrounding user text byte-for-byte and require repair/resolution for ambiguous markers.

**User decision — incremental replacement**: Keep already installed v3 skills active and byte-identical until their v4 replacements are both published and unlocked. Absence from week one is neither deletion nor an archival trigger and does not block the overall edition switch. A retained v3 file is already local; this does not confer fresh v3 access or early v4 access. Replace a skill as one coherent bundle of SKILL.md and support files after conflict checks; per-source-file commit pins still apply when building that v4 bundle. Dependencies/references must validate against the planned retained-plus-replaced set; report an incompatible replacement without silently deleting its legacy dependencies. Rules/prompts/configs use the same truthful provenance and pending policy; shared managed rule blocks remain subject to the existing preflight reconciliation.

**Manifest contract**: Keep project/root and profile `course` set to the target `10xdevs4`, independently of artifact origin. Add a versioned `courseTransition` section to compatible manifest schema v3: `{version:1, fromCourse:"10xdevs3", toCourse:"10xdevs4", artifacts:<record>}`. Key entries by stable artifact type/identity within the profile, not by lesson ID alone. Each entry records `installedFrom` (course, source lesson IDs, known release/source revision or explicitly unknown), tracked paths and last installed upstream file hashes, `target` (course and mapped artifact/lesson identities when known), and `status` (`pending`, `conflict`, `applied`) with reason (`locked`, `unpublished`, `unmapped`, `local_changes`, `replacement_required`) where applicable. Applied entries record the verified v4 release and upstream hashes; copied legacy entries never get relabeled as downloaded v4. Unknown legacy hashes remain unknown; observed local snapshots are not fabricated upstream baselines. Local edits remain distinct from the upstream installed baseline.

Separate legacy lesson ownership from v4 `lessons` entries: identical m1lN IDs across editions must not overwrite origin or imply completed v4 lessons. The transition ledger retains source lesson ownership and file hashes for pending/conflicted entries; the ordinary v4 lesson ledger records only actual target delivery. Aggregate managed-file ownership is the union of current v4 entries and retained transition entries, deduplicated by physical path. A get/sync/filtered apply, stale-file sweep or profile switch must preserve this union and transition metadata, including files absent from the v4 bundle. Do not run the old v3 lesson list through v4 get/sync or fetch v3 updates after switching the target edition. New schema parsing distinguishes missing transition (ordinary install) from malformed/unsupported transition (safe write error); every manifest rewrite preserves the section explicitly.

#### 4. Durable local migration transaction and manifests

**Files**: new `src/lib/migration-journal.ts`, `src/lib/project-write-lock.ts`, `tests/migration-recovery.test.ts`; migration coordinator above; all project-writing entry points (`get.ts`, `sync.ts`, profile migration, writer and any doctor repair path); manifest/root-binding writers and CLI guide.

**Intent**: Back up exact before-images, stage only authorized unlocked replacements from the selected release locally and execute one project-wide recovery protocol. Use a project-local `.10x-cli/migrations/<id>/` journal/backup directory outside tool discovery paths; validate containment and regular-file types and create private permissions where supported. Do not upload backups, add them to Git or change ignore rules automatically. Backups have no automatic expiry or deletion in this release; document their location and potential inclusion in a user's Git operations.

**Contract**: Preview/dry-run changes no project files. After explicit apply with all decisions settled, acquire one exclusive project lock, re-read fingerprints for all manifests/binding/target files and reject stale previews before changing content. Stage verified target bytes, exact original file bytes/modes/existence and original manifests/binding; verify backup hashes before starting. Journal schema includes transaction ID, project identity, source/target course, release identity, input fingerprints, immutable plan digest, accepted decisions, planned operations with before/after hashes, durable per-operation state and overall `prepared/applying/committing/completed/rolling_back/rolled_back` state. Persist intent before each mutation and completion afterward; atomic file replacement and durable journal writes make interrupted operations distinguishable by their observed before/after hashes, not by optimistic status alone. Cover process interruption and supported filesystem durability explicitly without claiming a whole-tree atomic rename or protection against arbitrary external file writers.

An active journal blocks all other upgraded-CLI project writes under the shared lock, even when mixed intermediate manifests exist. Resume/rollback use the journal directly rather than the ordinary binding-conflict check. Dead-process lock recovery never deletes a journal or assumes completion. A missing/corrupt journal, backup or staged payload blocks recovery with a diagnostic; never infer empty state or reconstruct it from latest. Recovery reads local staged bytes and backup; it never re-resolves latest or refetches another release. A network/auth failure during initial fetch changes no target files. Local rollback does not require network or an active membership; downloaded files are not subject to retroactive deletion. Resume uses already-authorized staged bytes without any new remote access.

After all replacements and retained files match their planned state, enter committing, atomically replace each affected profile manifest, then change the root binding to v4, verify the whole set and mark completed. Recovery handles interruptions between any pair of these writes; the active-journal gate prevents ordinary operations from observing a false completed state. Manifests retain truthful per-file ownership/upstream hashes, language/tool representation and per-lesson release identity; v3 origin/ownership remains explicit for pending or conflicted artifacts and changes only after successful v4 replacement; user files are never reclassified as v4-managed. A failed multi-profile transaction cannot report success for one profile and leave another profile binding silently on v3. Transaction completion means the available subset and pending ledger were committed consistently; it does not mean every retained artifact has reached v4. Pending artifacts never keep a completed transaction journal active or block normal use of the project.

Rollback reverses only this transaction's changes and restores original manifests/binding. Before every reverse action, compare current bytes with the expected transaction-produced state. If a user edited files since apply, preserve those bytes and report a recovery conflict instead of overwriting them. Post-completion rollback is supported only while the affected state still matches the transaction; later get/sync/migration changes require explicit conflict resolution. Keep backup and journal after completion/rollback; normal writes are unblocked only after a verified terminal state. Upgraded CLI enforces the lock/journal; previously released CLIs do not understand it and cannot be claimed prevented from overwriting the project. Explicitly require upgrading and not running old CLI during/after migration, test detection of unexpected file changes, and do not claim that a manifest-version bump alone provides a downgrade guard.

#### 5. Sync completes pending replacements as v4 unlocks

**Files**: `src/commands/sync.ts`, `get.ts`, `src/lib/manifest.ts`, `writer.ts`, `tool-switch.ts`, migration planner/coordinator and new `tests/incremental-course-migration.test.ts`; API discovery/catalog/migration-map tests and CLI guide.

**Contract**: Each sync on a v4-bound transitioning project resolves one target release, loads the current mapping and evaluates pending artifacts against current authorized module state before catalog-digest short-circuits and the installed-lesson filter. Add eligible targets even when their mapped lesson was never downloaded under v4 or has a different ID. Check availability even when release ID and content digests are unchanged: a release timestamp or KV override can unlock an existing lesson. An initial migration does not claim every pending target available or delivered. A mapped artifact may be replaced if at least one authorized unlocked target lesson supplies the intended version; another locked occurrence must not unnecessarily block it. Missing mapping or known locked/unpublished target remains pending with an actionable status; permission errors, corrupt responses and outages are errors, not invented lock states.

Use the existing replacement planner and per-path conflict checks to stage only newly eligible tracked artifacts and required support files, not to install all unrelated skills in the newly unlocked lesson or mark its untouched content as applied. Apply each continuation as a bounded recoverable transaction pinned to one release, across all affected profile instances/shared paths; serialize it with ordinary project writes. Default sync checks pending entries across all recorded profiles; explicit tool/module filters report which entries were deferred and do not claim whole-project convergence. Update origin/release/hashes and status only after the complete skill bundle and manifest commit succeed; clear its old ownership from every legacy lesson association for that physical artifact, without promoting unrelated artifacts from those lessons; pending/conflicted files remain tracked and protected. A skipped local conflict remains outstanding with its actual v3 origin; do not mark it applied or advance its upstream baseline merely because other files updated. A pending local edit can coexist with successfully migrated independent artifacts when the accepted plan leaves the conflict untouched and reports it honestly. Rollback restores the before-state of that continuation, not a stale pre-migration snapshot.

Get may also satisfy a pending entry when it actually installs the unlocked matching v4 artifact; otherwise it leaves it pending. Profile switches transfer both installed provenance and pending state without changing course eligibility. An ordinary sync with remaining pending entries reports updated/pending/conflict counts separately from I/O failures. Retaining local v3 bytes never triggers a network v3 refresh or grants access to a locked v4 bundle. Future explicit retirements require an actionable decision; temporary omission from a catalog/map never causes archive/delete. Once every transition entry has reached v4, retain provenance/history and report zero pending; project target remains v4 throughout.

### Success Criteria:

#### Automated Verification:

- Deletion regressions preserve modified/untracked/shared/legacy-no-hash files and adopted configs, including --force; symlink/traversal tests pass.
- Profile-migration conflict and injected I/O failure tests preserve source/destination ownership, course and shared rules.
- Sync repairs missing files and handles language/tool changes despite unchanged upstream digest; targeted CLI tests, lint and builds pass: `bun test tests/*.test.ts && bun run typecheck && bun run lint && bun run build && bun run build:binary`.
- Migration preview tests cover explicit mappings, week-one-only v4, unknown provenance, local/untracked conflicts, missing hashes, legacy profiles and shared rules; dry-run leaves the project unchanged.
- Migration recovery tests inject interruption before and after every file, manifest and binding write; resume/rollback preserve bytes, ownership and one selected release across all profiles.
- Project-lock and stale-preview tests block concurrent writers and preserve edits made after apply; offline rollback restores the verified source state without deleting user files.
- Incremental migration preserves active v3 files and original provenance for locked/unpublished/unmapped targets while committing a v4 project binding; get/sync/cleanup/profile-switch retain pending ownership without lesson-ID collisions.
- Pending-sync tests unlock v4 with unchanged release/digest, replace only eligible installed artifacts, preserve local conflicts and update per-artifact provenance only after recoverable successful writes.


## Phase 6: Verify candidate CLI and API together before release

**Repository**: Both

### Overview

Use real auth session/callback/refresh logic and the exact candidate binary so passing tests prove the path users need.

### Changes Required:

#### 1. Coordinated fixtures and regression matrix

**Files**: toolkit `packages/api/src/__tests__/e2e/e2e-cli.test.ts`, `vitest.e2e.config.ts`, test fixture helpers, `packages/api/scripts/smoke-deployed.mjs`; CLI command/print/auth tests and `tests/smoke/`.

**Intent**: Add v3-only, v4-only, dual-course and no-access fixtures; complete login/callback/poll/refresh through the real services with intercepted mail transport. Exercise every first-week lesson and the selected course using the candidate compiled CLI. No real emails are sent by automated fixtures.

**Contract**: Verify auth → list 1 → m1l1–m1l5 → second get → sync, both languages and representative tools, printed content and dry-run immutability, revoked identity, legacy token, new v4 purchase with stale v3 JWT, unavailable content and denied cross-course catalog/artifact/ZIP reads. Check actual downloaded bytes/manifest/binding and local-edit preservation; manually signed JWT fixtures may test malformed/legacy cases but do not substitute for login. Inject clocks in time-sensitive tests; no expired event fixture. Preserve baseline CLI 1.20.0 v3 read/update behavior against the new backend and explicitly document that v4 users must upgrade.

The current CLI allows only the canonical production hostname or loopback, and test signing-key overrides only on loopback. Run pre-release CLI/API rehearsal through the existing localhost Worker harness with isolated fixture keys. Inspect a deployed preview API directly if needed; real-email/candidate-CLI account rehearsal runs against the secured production API after v4 content verification and before npm publication. Do not loosen hostname or signing-key allowlists merely to make a preview test work.

#### 2. CI contracts and release documents

**Files**: both `.github/workflows/ci.yml`; toolkit root `package.json`; CLI `scripts/generate-types.ts`, README, `skills/10x-cli-guide/SKILL.md`; toolkit `docs/how-to/release-10xdevs4-cli.md`, existing `context/changes/support-10xdevs-4/change.md`.

**Intent**: Pin cross-repo candidate SHAs for pre-merge verification and make the deployed preparation API/content revision explicit for release checks. Record this change as the owner of the formerly deferred CLI track.

**Contract**: Toolkit E2E uses `E2E_CLI_PATH` or an equivalent exact candidate binary path; it must not silently fall back to npm latest. CLI release requires the coordinated gate, Linux/Windows tests and normal smoke/build checks. A backend PR cannot certify a CLI feature by checking another branch's code. Regenerate/check OpenAPI types deterministically from candidate source. After automated gates, run CSC implementation review and address critical findings before the deployment phase.

### Success Criteria:

#### Automated Verification:

- Coordinated real-auth matrix passes: `E2E_CLI_PATH=/Users/admin/code/10x-cli-v4-delivery/dist/10x pnpm test:e2e:cli` from toolkit (CI uses its own exact checkout path).
- Full clean toolkit gate passes: `pnpm ci:local`; CLI unit/type/lint/build/binary and `bun test tests/smoke/` pass.
- CI records exact candidate SHAs and passes Windows checks; implementation review has no unresolved critical findings.
- Candidate E2E migrates an existing multi-profile v3 project to v4, resolves unmapped materials using the selected policy, then syncs v4; interrupted migration and rollback are rehearsed on Linux and Windows.


## Phase 7: Roll out backend protection, first-week content and CLI in order

**Repository**: Both

### Overview

Deliver the prepared system through a separately protected backend before publishing v4. This phase includes production side effects and is reached only after the requested pre-implementation presentation and later completed implementation review.

### Changes Required:

#### 1. Security preparation release

**Files**: toolkit `.github/workflows/ci.yml`, `docs/how-to/release-10xdevs4-cli.md`, existing Circle configuration runbook.

**Intent**: First release contains membership fixes, complete guards, v4 auth/discovery, retired event endpoint and publication selection/freeze safeguards, with no v4 production uploads. Verify real v4 Circle configuration and existing grants using read-only probes; if incomplete, execute the existing explicit v4-only backfill after reviewing its preview/diff.

**Contract**: Establish a quiet publication boundary BEFORE inventory: inspect queued/running toolkit publishing/deploy jobs, let them finish or explicitly cancel them as part of rollout, and verify no old-revision uploader can still run. Block new publication triggers during the boundary. Then capture v3 complete backup/key hashes BEFORE any new production job can republish content. Prevent preparation release's ordinary content-change detection from uploading v3 or v4; keep publication disabled until the secured production Worker is verified. Validate secured Worker in preview then production; discovery may say v4 unavailable while its catalog is absent. Record the deployed revision and keep it as the rollback floor.

#### 2. First publication, verification and CLI release

**Files**: same workflow/runbook; both change artifacts and release evidence.

**Intent**: Only after the guard probe succeeds, publish and verify the five v4 lessons and EN/PL variants, then promote the verified release pointer; release the candidate CLI after backend/content checks pass.

**Contract**: Require complete expected object inventory and module 1 unlocked state. Compare live v3 key set/hashes with baseline. Real account rehearsal must demonstrate v4-only auth and m1l1–m1l5, dual-owner selection and existing-v3 sync preservation. Record outputs without credentials/raw membership records. Publication and CLI release are not marked complete on the basis of local tests alone.

#### 3. Rollback and CSC closure

**Files**: runbook, canonical plan/change and implementation review.

**Intent**: Roll back the v4 current pointer to a verified release or withdraw v4 discovery/delivery and revert to the secured preparation Worker if needed; never restore the unguarded old Worker while v4 objects remain. Preserve downloaded local files and v3 publication.

**Contract**: Retain verified immutable v4 releases and pointer history before subsequent promotion; rehearse pointer rollback and withdrawal, preserving all selected-release content for active operations. Releasing a prior CLI is not a project migration; advise against old CLI writes in v4-bound projects. Archive through CSC only after actual checks and release evidence are complete; event branches remain historical donor references, not merged dependencies.

### Success Criteria:

#### Automated Verification:

- Production publication probes verify complete v4 object inventory, unlocked module 1 and unchanged v3 key/hash inventory.
- Post-deploy CLI/API smoke records the deployed revisions and succeeds without secrets in saved evidence.

#### Manual Verification:

- Confirm intended v4 first-week materials, preview fixture rehearsal and secured-production real-account login/list/get/sync for v3-only, v4-only and dual-course users.
- Review and execute the two-stage toolkit rollout followed by CLI publication; record successful account rehearsal and rollback-floor revision.

## Testing Strategy

Use focused regression tests tied to the observed failures, then full clean CI and candidate-source E2E. Tests must inspect real project bytes, ownership and API responses, not only mock calls. Negative matrix includes v3/v4 cross-access, unknown R2 course, malformed/legacy token, retired event ZIP, missing publication, outage, stale JWT after upgrade, identity promotion/collision, modified/untracked/shared files, symlink ancestors, partial migrations and failed writes.

No real emails in automated tests; capture mail locally and traverse actual callback/poll/refresh handlers. Preview human rehearsal validates email delivery separately. Candidate E2E runs both repos' intended revisions rather than npm latest. Test v3 compatibility explicitly; upgrading CLI is required for v4 selection/binding and there is no claim that old clients honor the new project file.

## Performance Considerations

Normal course authorization uses JWT claims; legacy-claim fallback temporarily reads KV. Discovery performs one membership read and bounded catalog checks only for registered active grants, once per command. Forced refresh is at most once for a newly granted course. No trial course downloads or repeated login messages. Keep existing bounded publisher concurrency, but separate the final current-pointer promotion.

## Migration Notes

Explicit project migration is now in scope (Phase 5 subsections 3–4), with immutable target-release selection in Phase 3 and coordinated E2E in Phase 6. It is the only edition-switching write path. The user resolved the policy: retain not-yet-unlocked v3 artifacts active and tracked as pending under the v4 project target; later sync completes eligible replacements. This deliberately permits recorded mixed artifact origins during transition, without two independent course update streams or early lesson access.

No event grants or event-install migration. Preserve v2/v3 manifests by seeding binding from consistent metadata; malformed/newer/split metadata blocks writes with an actionable error. Read-only mode never “repairs” files. Local partial failure leaves the binding/ledgers truthful. Historical alternate-course get may have recorded v3 incorrectly, so ambiguous provenance is not guessed.

Backend accepts active v3/v4 and preserves API slugs, token response and v3 mirror. Freeze live v3 before any production publishing job changes. Rollback stops at the secured preparation API; withdrawing the v4 current pointer stops discovery/delivery while leaving local files and v3 untouched. Repairing a legacy mislabeled project is a separate explicit operator action, never an automatic course change.

## Findings Traceability

| Review finding | Plan resolution |
|---|---|
| F1 deletion/print | No event hooks; Phase 4 pure preview and Phase 5 underlying safe removal |
| F2 unknown-course bypass | Phase 2 deny unknown routes/aliases before R2; Phase 7 guard-before-upload |
| F3 identity grant loss | Phase 1 shared identity-preserving writes and lifecycle/failure regressions |
| F4 missing v4 delivery | Phases 2–4 auth/discovery, five lessons and common selector |
| F5 provenance/sync | Phase 4 binding and actual course propagation; Phase 5 migration/freshness |
| F6 artificial/expired E2E | Phase 6 actual auth+candidate matrix; Phase 7 real-account evidence |
| New master event endpoint | Phase 2 retirement while retaining normal v3 published course |
| New master get metadata bug | Phase 4 pass course at every writer boundary |
| New deployment ordering gap | Phase 3 scoped publishing; Phase 7 separate security release |

## References

- research.md — current source evidence and historical context.
- plan-brief.md — user-facing recommended outcomes.
- decisions.md — executive decision brief (2026-09-09), with context and final owner choices; decisions-details.md retains detailed comparisons and evidence tasks. Alternatives do not amend this plan until selected.
- Prior review: /Users/admin/code/10x-cli-unaited-worktree/context/changes/unaited-csc-access/reviews/impl-review.md.
- Toolkit context/changes/support-10xdevs-4/plan.md:237 — superseded CLI deferral.
- Toolkit context/foundation/lessons.md — self-contained skill support files.
- Bases: CLI f89f195; toolkit da989a6. Worktrees: /Users/admin/code/10x-cli-v4-delivery and /Users/admin/code/10x-toolkit-v4-delivery.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Preserve membership across course and identity changes

#### Automated

- [ ] 1.1 Membership lifecycle regression matrix passes: `pnpm --filter @przeprogramowani/api test --run`.
- [ ] 1.2 Injected write failures followed by retry preserve unrelated grants, v3 mirror and consistent current reverse identity.

### Phase 2: Authorize every content path and expose available courses

#### Automated

- [ ] 2.1 Auth and route matrix passes: `pnpm --filter @przeprogramowani/api test --run`.
- [ ] 2.2 A populated unknown-course R2 fixture is denied for empty/v3/v4 claims across every content endpoint; retired event path never returns bytes.
- [ ] 2.3 Legacy-token, malformed-claim, callback revocation, refresh and discovery outage tests pass.

### Phase 3: Publish v4 week one independently and freeze the live v3 publication

#### Automated

- [ ] 3.1 Scoped build succeeds: `pnpm --filter @przeprogramowani/course-content build && pnpm --filter @przeprogramowani/course-content build:lessons --course 10xdevs4`.
- [ ] 3.2 Selected-bundle validation passes: `node packages/course-content/scripts/validate-bundles.mjs --course 10xdevs4`.
- [ ] 3.3 Pipeline regression tests prove stray/modified v3 and unknown dist directories never enter transforms or production PUTs; incomplete uploads do not publish a catalog.
- [ ] 3.4 Inventory tests cover pagination, full key/hash comparison and download failure; course-content tests pass: `pnpm --filter @przeprogramowani/course-content test`.
- [ ] 3.5 Source-resolution tests prove latest is resolved once, per-file pins take precedence, unpinned sibling files follow the course default, missing pinned inputs fail, and provenance/cache identity reflect the assembled sources.
- [ ] 3.6 Release tests prove incomplete uploads never become current, competing promotions do not overwrite each other, retained releases are immutable, and get/sync/migration read one selected release across every content route.


### Phase 4: Resolve the best available course and bind project writes safely

#### Automated

- [ ] 4.1 Selection, legacy/corrupt/future/conflicting manifest and stale-token upgrade matrix passes in new course-selection/project-course tests.
- [ ] 4.2 Snapshot tests prove read-only modes preserve project/preferences with TTY orphan migration, --tool and --lang; failed preflight creates no binding.
- [ ] 4.3 Partial-write failure retains correct binding; get passes actual course to writer; CLI typecheck/tests pass: `bun run typecheck && bun test tests/*.test.ts`.

### Phase 5: Protect local edits during updates and profile migration

#### Automated

- [ ] 5.1 Deletion regressions preserve modified/untracked/shared/legacy-no-hash files and adopted configs, including --force; symlink/traversal tests pass.
- [ ] 5.2 Profile-migration conflict and injected I/O failure tests preserve source/destination ownership, course and shared rules.
- [ ] 5.3 Sync repairs missing files and handles language/tool changes despite unchanged upstream digest; targeted CLI tests, lint and builds pass: `bun test tests/*.test.ts && bun run typecheck && bun run lint && bun run build && bun run build:binary`.
- [ ] 5.4 Migration preview tests cover explicit mappings, week-one-only v4, unknown provenance, local/untracked conflicts, missing hashes, legacy profiles and shared rules; dry-run leaves the project unchanged.
- [ ] 5.5 Migration recovery tests inject interruption before and after every file, manifest and binding write; resume/rollback preserve bytes, ownership and one selected release across all profiles.
- [ ] 5.6 Project-lock and stale-preview tests block concurrent writers and preserve edits made after apply; offline rollback restores the verified source state without deleting user files.
- [ ] 5.7 Incremental migration preserves active v3 files and original provenance for locked/unpublished/unmapped targets while committing a v4 project binding; get/sync/cleanup/profile-switch retain pending ownership without lesson-ID collisions.
- [ ] 5.8 Pending-sync tests unlock v4 with unchanged release/digest, replace only eligible installed artifacts, preserve local conflicts and update per-artifact provenance only after recoverable successful writes.


### Phase 6: Verify candidate CLI and API together before release

#### Automated

- [ ] 6.1 Coordinated real-auth matrix passes: `E2E_CLI_PATH=/Users/admin/code/10x-cli-v4-delivery/dist/10x pnpm test:e2e:cli` from toolkit (CI uses its own exact checkout path).
- [ ] 6.2 Full clean toolkit gate passes: `pnpm ci:local`; CLI unit/type/lint/build/binary and `bun test tests/smoke/` pass.
- [ ] 6.3 CI records exact candidate SHAs and passes Windows checks; implementation review has no unresolved critical findings.
- [ ] 6.4 Candidate E2E migrates an existing multi-profile v3 project to v4, resolves unmapped materials using the selected policy, then syncs v4; interrupted migration and rollback are rehearsed on Linux and Windows.


### Phase 7: Roll out backend protection, first-week content and CLI in order

#### Automated

- [ ] 7.1 Production publication probes verify complete v4 object inventory, unlocked module 1 and unchanged v3 key/hash inventory.
- [ ] 7.2 Post-deploy CLI/API smoke records the deployed revisions and succeeds without secrets in saved evidence.

#### Manual

- [ ] 7.4 Confirm intended v4 first-week materials, preview fixture rehearsal and secured-production real-account login/list/get/sync for v3-only, v4-only and dual-course users.
- [ ] 7.5 Review and execute the two-stage toolkit rollout followed by CLI publication; record successful account rehearsal and rollback-floor revision.
