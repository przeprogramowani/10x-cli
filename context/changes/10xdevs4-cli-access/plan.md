# 10xDevs 4 — access and delivery implementation plan

## Overview

First of two independently releasable changes: v4-only login and first-week get/list/sync for new projects, transparent support for existing v3 users, safe updates, and independently published v4 content. Existing v3 projects keep v3 even after buying v4. Explicit project migration ships separately in [10xdevs4-project-migration](../10xdevs4-project-migration/plan.md).

**Status (2026-09-12)**: accepted decisions incorporated; dedicated [plan review](reviews/plan-review.md) is SOUND after corrections; implementation has not started. This plan owns the cross-repository Progress for change `10xdevs4-cli-access`. Toolkit companion links here. Each change can need PRs in both repositories; the security preparation deployment within this first change is a rollout stage, not a third product change.

## Current State Analysis

`git fetch origin master` on 2026-09-12 confirms CLI HEAD = origin/master = `f89f19506cab8c9bbeb112242e4485fce4f1b77b` and toolkit HEAD = origin/master = `da989a6f7d4963c275a98943e85d225baf426228`. Both diffs against the researched bases are empty. Planning directories are untracked; unrelated original worktrees contain user work and are excluded. See [research delta and evidence](evidence.md).

Provisioning exists but auth requires v3, CLI defaults to v3 and the builder has no v4 definitions. Content routes lack course-specific guards. Reviewed risks include grant loss, local-file deletion, dropped get course metadata, preview mutations and upload-before-Worker ordering. Existing research still grounds these code claims. The event branch was never deployed; a separate master event ZIP endpoint must still be retired.

## Desired End State

- V4-only users log in and use `list 1`, `get m1l1` through `get m1l5` and sync without a course flag, with content validated against the formal v4 curriculum.
- Explicit request → project binding → API default. New dual-owner projects prefer available v4; existing v3 projects remain v3. Access comes from active supported grants, with no login guessing or fallback on outages.
- V3-only participants retain their commands, grants, published content and existing projects. Both released CLI 1.20.0 against the new backend and the candidate CLI against legacy v3 projects are release gates. No extra flag or compulsory migration is required.
- V3 uses a verified pre-v4 cutoff plus explicit maintenance; live R2 bytes remain unchanged in this rollout. V4 uses latest sources selected at build time. Source precedence: **file SHA → whole skill package SHA → course default**.
- One immutable v4 release per operation; one CI publication path with manual promotion of a verified build. Existing v3 storage and response contracts remain compatible.
- Ordinary updates preserve local edits, untracked files and profile ownership; preview does not write project/preferences.

## Scope and split

The second change owns migration commands, actual reviewed v3→v4 mappings, transition manifests, pending continuation and last-operation recovery. This change delivers the versioned release/map envelope needed by that change, including an empty map where no mapping is yet reviewed. No migration command is advertised as available in this release; course mismatch directs users to a separate project until the migration release ships.

No event branch merge, event-user migration, self-enrollment, get-by-name dependency, new entitlement database, generic release platform, GC or automatic course switch. No delivery of weeks 2–5 in the initial v4 release. Formal curriculum metadata may describe future weeks without shipping their content or changing access gates.

## Accepted decisions

Authority: [decisions-record.md](decisions-record.md), SHA-256 `3f877a33e03b5e3886bbb0073a1e792da7acdd78163b4aeac1a8a8567f7f489b`. [decisions.md](decisions.md) and [decisions-details.md](decisions-details.md) are preserved acceptance-basis documents; their historical recommendations/blank fields do not override the record. [Decision and step allocation](split-map.md) covers all D01–D16 and the old 30 criteria.

This change implements D01 A, D02 C, D03 B, D04 A, D05 A with package-pin clarification, D06 C, D07 C, ordinary-update safeguards from D13 A, and access/delivery parts of D14 A, D15 C, D16 C. The migration plan implements D08–D12 and remaining D13–D16 obligations.

## Critical Implementation Details

Publication must stay disabled until a separately deployed secured Worker is verified. Stop old publishing jobs before the live-v3 snapshot. Latest source selection never means automatic current-pointer promotion.

An ordinary first install validates remote payload and local preflight, then persists binding immediately before its first project write and retains binding after partial failure. All existing supported profile manifests participate in detecting a prior course.

KV merge/retry repair promises sequential preservation, not cross-isolate transactions. Keep the existing bounded token revocation window. No new infrastructure is implied by D02 C.

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

#### 1. Formal v4 curriculum and validated content definitions

**Files**: new `packages/course-content/src/courses/10xdevs4/index.ts`, `module-01/index.ts`, `module-01/lesson-01.ts` through `lesson-05.ts`; new `src/courses/index.ts`; `src/build/build-lessons.ts`.

**Intent**: D03 B replaces the copied-v3 recommendation. Add new `packages/course-content/src/schemas/curriculum.ts`, `src/courses/10xdevs4/curriculum.ts`, `src/build/validate-curriculum.ts` and coverage tests in that package. The formal program is reviewed against the actual v4 course; existing v3 definitions are research input, not proof of equivalence.

**Contract**: Versioned curriculum declares course, modules, ordered lesson IDs, release schedule, language requirements, expected stable artifact type/name identities, cumulative lesson membership and required managed rules. Separate expected program metadata from deliverable content. Validate independently authored expectations against definitions AND final EN/PL bundles: missing/extra/duplicate identities, bad cumulative order, dangling support references and rules/language mismatches fail build. Do not generate the expected spec from the same bundles being validated. Future program entries explicitly marked not yet published cannot enter the first-week release inventory. Initial delivery contains only m1l1–m1l5; confirm actual contents and effective module-1 timestamp/KV state in W04 before final build/promotion. No unverified calendar date or copied list counts as curriculum approval. Wire the validator into selected-course build, package scripts and `ci:local`; report coverage by lesson/artifact/language and unresolved program entries.

#### 2. Course-scoped pipeline

**Files**: `src/build/build-lessons.ts`; `packages/course-content/scripts/transform-content.mjs`, `validate-bundles.mjs`; `packages/api/scripts/r2-sync.mjs`; `packages/course-content/package.json`; root `package.json`; `scripts/dev-watch.mjs`; `packages/api/scripts/dev-seed.mjs`; `.github/workflows/ci.yml`, `.github/workflows/build-artifacts.yml`.

**Intent**: Pass a validated course selector end-to-end. Registry policy, not directory enumeration, decides the production upload set. Clean/rebuild only selected course output. Restore cache errors distinguish missing optional cache objects from auth/network failure.

**Contract**: Build/transform/validate and upload accept `--course 10xdevs4`; unknown selectors fail. Local/test builds may explicitly include frozen v3 fixtures, but production PUT planning rejects v3 even if its dist files are present or explicitly selected. Preparation release has publication disabled; content release enables only v4. Upload every lesson/language object, catalog and release manifest under a new immutable release prefix and verify success before switching the current pointer; incomplete publication cannot become the active release. CLI return codes must fail the job on upload/verification errors.

#### 3. V3 inventory and rollout backup

**Files**: new `packages/api/scripts/content-inventory.mjs`, corresponding tests and new `docs/how-to/release-10xdevs4-cli.md`.

**Intent**: Capture the actual published v3 key set and byte hashes, with a complete backup outside dist, before rollout. Re-read it after publication to prove no change. The old proposed source SHA is not used as a substitute for production bytes.

**Contract**: Paginate the complete prefix, download catalog and every language/lesson object, record SHA-256 and key inventory, and fail on any missing read/auth/network error. Proposed commands are `node packages/api/scripts/content-inventory.mjs snapshot --remote --course 10xdevs3 --output <backup-directory>` and `node packages/api/scripts/content-inventory.mjs compare --remote --course 10xdevs3 --baseline <backup-directory>/inventory.json`; compare exits nonzero on added/deleted/changed keys. The output directory is an operator-selected artifact location, never a placeholder source file. Backup is excluded from source control/dist/upload selection. Preserve live v3 in place; no delete/restore cycle in normal release. V4 uses the immutable release contract below; rollback selects a previously verified release instead of overwriting lesson objects.

#### 4. Course source defaults, skill-package pins and file exceptions

**Files**: `packages/course-content/src/build/core.ts`, `src/build/build-lessons.ts`; new `src/build/source-revisions.ts`, source-resolution tests and course-specific source configuration alongside `src/courses/10xdevs3/index.ts` and `src/courses/10xdevs4/index.ts`; transform/cache handling in `packages/course-content/scripts/transform-content.mjs`.

**Intent**: Use one source-selection mechanism for both editions, without changing skill names or requiring Git access on the participant's machine. Course maintainers declare a default revision, optional whole-skill package revisions and explicit file overrides in the toolkit repository. V4 uses `latest` by default; a package override binds the complete skill directory to one full commit SHA until changed or removed; file overrides are explicit exceptions.

**Contract**: Precedence is exact file SHA → whole skill package SHA → course default. Override keys are canonical repository-relative artifact paths; reject traversal, paths outside the artifact root, duplicate/conflicting entries and nonregular files. Resolve `latest` once per build to the clean candidate master commit selected for publication, then use that full SHA for inputs with neither a package pin nor a file pin. It means the latest successfully published source revision available through the API, not an on-demand Git fetch by CLI. Read pinned files from isolated immutable Git trees; do not switch or mutate the operator's checkout. Invalid/unavailable commits and files absent at the selected commit fail the build; never silently fall back to latest.

A skill-package pin covers SKILL.md, references, scripts, templates and every included support file. Enumerate the package tree at its selected package SHA (or course default), then overlay explicitly named file exceptions from their SHAs; a file present only in latest must not leak into a pinned package. Explicit extra paths must be canonical and within that skill; absent pinned inputs fail. A pin explicitly addressed to SKILL.md alone is a file exception, not the package pin. Preserve executable modes and record tree membership/deletions as well as file bytes. Validate the assembled skill's support-file references and existing self-contained bundle invariants. The same source file used by several lessons resolves consistently within the course build. Record course, resolved default SHA and package selections, file exceptions and each included file's resolved SHA, source hash and executable mode in a build provenance manifest retained with release evidence. Cache identity includes the assembled source inputs and transform configuration/version, so a pin change cannot reuse stale transformed output. Pins bind source bytes; translations/transforms remain a separate versioned build input. Existing signed API bundles remain the CLI delivery boundary; no new client-side pin flag or unsigned content path is introduced.

V3 uses an explicit full-SHA baseline from before v4 plus deliberately reviewed maintenance changes, never the moving v4 default. The historical proposal `157667a30ad52169ba489d3dccc4bfc36ad530af` (2026-08-06) is only a candidate cutoff: verify the final v3 baseline against course history before selecting it. Selecting source revisions does not authorize rebuilding or replacing live v3 objects in this rollout. A subsequent v3 maintenance publication needs a separately scoped release with an explicit expected key/hash diff against the retained production inventory; normal v4 publication continues to reject all v3 PUTs.

#### 5. Minimal immutable v4 publication and release selection

**Files**: `packages/api/scripts/r2-sync.mjs`; new `packages/course-content/src/schemas/release.ts`, `packages/api/src/lib/content-release.ts`; schemas `catalog.ts`, `bundle.ts`; API routes `catalog.ts`, `modules.ts`, `lessons.ts`, `artifacts.ts`, `download.ts`, `me.ts`; `lib/lang-resolver.ts`, `lib/signing.ts`; API contracts/OpenAPI; CLI `src/lib/api-content.ts`, `api-client.ts`, generated types, `get.ts`, `list.ts`, `sync.ts`, `tests/helpers/api-content-mock.ts` and, in the second change, the migration caller. New files are relative to their package's existing source directories where applicable.

**Intent**: Add only the release primitive needed to fetch a stable course snapshot. R2 bucket remains private; authorized API routes resolve release objects and serve signed material. Existing v3 keys/routes retain their storage contract.

**Contract**: V4 object keys are `10xdevs4/releases/<releaseId>/catalog.json`, `manifest.json`, `migration-map.json`, and `lessons/<existing bundle filename>`. The per-course pointer `10xdevs4/current.json` has `{schemaVersion:1, releaseId, manifestHash}`. The release manifest records schema version, course, release ID, build source provenance, transform version/configuration, migration-map hash, and relative object keys with hashes/sizes for the catalog, migration map and all bundles. It excludes itself from its own hash inventory; the pointer contains its final byte hash. A release ID identifies final built outputs, not merely a Git commit, since pins/transforms may differ. Persist the exact staged outputs for retry; never overwrite an existing release object with different bytes.

The publisher uploads/validates the complete release and writes its manifest last. D07 C: one canonical CI path accepts a manual promotion request identifying a green build, release ID, manifest hash and expected current identity; it promotes the exact staged outputs without rebuilding latest. Automatic build/upload never changes current. Both existing workflow entry points delegate to that path or lose production write capability; local tools cannot bypass promotion policy. Rollback/withdrawal use the same controlled path. No new controller service, release channels or GC.

W08 is an explicit engineering gate before enabling promotion: the current `r2-sync.mjs` shells out to Wrangler PUT and has no demonstrated conditional pointer write. Verify the actual supported production client/credentials and implement conditional creation when current is absent plus compare-and-swap replacement when present. A failed condition must fail the job without a blind retry or overwrite. Record real staging/R2 evidence for competing writers, first publication and rollback; mocked tests or CI serialization alone cannot close W08. Serialize every publish/rollback path for a course, including operator tools, and reject promotion if the expected current pointer changed; pin the conditional-write mechanism in implementation against the actual R2 API and test competing publishers. No GC in this release: retain published releases and abandoned uploads, so active downloads and recovery do not lose their selected objects. Rollback switches to a previously verified pointer; withdrawal makes current unavailable while preserving objects. Old publishing/deploy jobs remain stopped at the Phase 7 quiet boundary.

Catalog responses add `releaseId` and `releaseManifestHash` for v4. All catalog/module/lesson/artifact/ZIP endpoints accept the optional query `release=<releaseId>`; absent selects current, present selects exactly that course's retained release with no silent fallback. Resolve release once per request and pass a validated storage prefix through all handlers and language resolution. Validate identifiers and manifest object paths; never construct cross-course/arbitrary R2 reads from query input. All routes continue to enforce live course access and module release state, including requests for historical releases. A withdrawn current edition is unavailable through explicit historical selection as well; a locally staged rollback remains possible. Missing/corrupt selected release data is an explicit error, never a fallback to another release or course.

An operation fetches the catalog once and propagates its release ID to every dependent fetch, including all profiles and lessons; sync uses the same release for the entire sweep. API-signed bundle and artifact payloads include the selected course, release ID and release-manifest hash; Add this release metadata when constructing the signed API response, after loading the stored bundle/artifact; do not put the final manifest hash into objects hashed by that manifest, which would create a hash cycle. CLI verifies course, release ID and manifest hash against its operation selection before using bytes. The release's versioned migration-map envelope (schema version, source/target course, release ID, entries) is delivered through an authenticated API response covered by the existing signing mechanism, binding map hash, release ID and course; add a `GET /api/courses/{course}/migration-map?release=<releaseId>` route, route inventory and OpenAPI contract. Its map must not confer access to either course. For this first change, entries may be empty with explicit unavailable mapping semantics; do not fabricate identity matches. The second change adds the reviewed stable-name allowlist/exception generator and actual mapping coverage. An old immutable release lacking reviewed mappings remains empty and cannot be retroactively amended. Normal sync on a later invocation chooses latest published v4; installed release metadata is provenance, not a permanent project pin.

**Reviewed-step clarification**: Keep historical Progress titles 3.5/3.6 for traceability. In 3.5, “unpinned sibling” now means neither a file nor package pin; a package pin takes precedence over the course default. In 3.6, migration reads are contract fixtures here; the actual migration command/E2E belongs to the second change. These notes supersede the old interpretation.

### Success Criteria:

#### Automated Verification:

- Scoped build succeeds: `pnpm --filter @przeprogramowani/course-content build && pnpm --filter @przeprogramowani/course-content build:lessons --course 10xdevs4`.
- Selected-bundle validation passes: `node packages/course-content/scripts/validate-bundles.mjs --course 10xdevs4`.
- Pipeline regression tests prove stray/modified v3 and unknown dist directories never enter transforms or production PUTs; incomplete uploads do not publish a catalog.
- Inventory tests cover pagination, full key/hash comparison and download failure; course-content tests pass: `pnpm --filter @przeprogramowani/course-content test`.
- Source-resolution tests prove latest is resolved once, per-file pins take precedence, unpinned sibling files follow the course default, missing pinned inputs fail, and provenance/cache identity reflect the assembled sources.
- Release tests prove incomplete uploads never become current, competing promotions do not overwrite each other, retained releases are immutable, and get/sync/migration read one selected release across every content route.

- Curriculum coverage validation rejects missing/extra/cumulative/language/rules mismatches and passes for the reviewed v4 first-week specification.
- Package-source tests verify file SHA over package SHA over course default, pinned tree membership, executable modes and cache invalidation.
- Promotion gate proves manual selection of exact verified outputs, conditional create/update failure and competing-writer/rollback behavior through the actual production publisher path.

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

**Contract**: Unknown-version, corrupt or conflicting manifests cause a safe `course_binding_invalid`/conflict error before mutations; they do not mean empty project. For released v2/v3 manifests with v3, preserve v3 unless explicitly diagnosed: historical get --course could mislabel another course, so do not infer alternate content from filenames. Unmerged directSkills/schema-version-4 manifests are unsupported and block writes rather than being erased. The course edition number and manifest schema version are independent. Explicit different-course get/sync in a bound project fails `course_mismatch` with guidance to use a separate directory; mention the dedicated migrate command only after the second release actually provides it. Explicit read-only viewing of another entitled course is allowed. Only the migration coordinator delivered by the second change may switch an existing project edition; this release rejects that switch.

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

#### 3. Preserve locally edited managed rules in ordinary updates

**Files**: `src/lib/writer.ts` (`planRules`, `planBundle`, `applyBundle`), `manifest.ts`, `tool-switch.ts`, `sentinel-migration.ts`; existing writer/rules tests.

**Contract**: Add optional managed-rule upstream hash and physical-path/sentinel ownership metadata to compatible schema 3. Both preview and apply classify the managed block against the last installed upstream baseline. Missing baseline or modified block requires explicit preserve/replace resolution before changing it, including rules opt-out/removal and --force. Unchanged bytes need no rewrite; never infer an upstream baseline by hashing arbitrary local content. Preserve the previous baseline when keeping local edits; persist the new verified upstream hash only for successful delivery. No blanket adoption of an old untracked block. Absent/new managed blocks can be created only after checking every current/legacy profile sharing that physical path; incompatible owners produce a conflict. Safe removals require no remaining owner. Preserve text outside sentinels byte-for-byte; malformed/orphan markers require repair/resolution, never the current truncating auto-repair. Reuse existing per-file conflict UI and backup behavior for explicit replacement; no migration journal is needed for this ordinary-write safeguard. Partial failures must leave rule ownership truthful. Old CLI remains compatible with additive metadata, without claiming it enforces the new protection.

### Success Criteria:

#### Automated Verification:

- Deletion regressions preserve modified/untracked/shared/legacy-no-hash files and adopted configs, including --force; symlink/traversal tests pass.
- Profile-migration conflict and injected I/O failure tests preserve source/destination ownership, course and shared rules.
- Sync repairs missing files and handles language/tool changes despite unchanged upstream digest; targeted CLI tests, lint and builds pass: `bun test tests/*.test.ts && bun run typecheck && bun run lint && bun run build && bun run build:binary`.

- Ordinary rules preview/apply/opt-out preserve local or unknown-baseline blocks, shared owners and surrounding text; explicit resolutions and partial failures keep upstream hashes truthful.

## Phase 6: Verify candidate CLI and API together before release

**Repository**: Both

### Overview

Use real auth session/callback/refresh logic and the exact candidate binary so passing tests prove the path users need.

### Changes Required:

#### 1. Coordinated fixtures and regression matrix

**Files**: toolkit `packages/api/src/__tests__/e2e/e2e-cli.test.ts`, `vitest.e2e.config.ts`, test fixture helpers, `packages/api/scripts/smoke-deployed.mjs`; CLI command/print/auth tests and `tests/smoke/`.

**Intent**: Add v3-only, v4-only, dual-course and no-access fixtures; complete login/callback/poll/refresh through the real services with intercepted mail transport. Exercise every first-week lesson and the selected course using the candidate compiled CLI. No real emails are sent by automated fixtures.

**Contract**: Verify auth → list 1 → m1l1–m1l5 → second get → sync, both languages and representative tools, printed content and dry-run immutability, revoked identity, legacy token, new v4 purchase with stale v3 JWT, unavailable content and denied cross-course catalog/artifact/ZIP reads. Check actual downloaded bytes/manifest/binding and local-edit preservation; manually signed JWT fixtures may test malformed/legacy cases but do not substitute for login. Inject clocks in time-sensitive tests; no expired event fixture. D14 requires two independent v3 regressions: actual released CLI 1.20.0 + candidate backend (login/refresh/list/get/sync, including legacy signed claims), and candidate CLI + existing v2/v3-manifest projects with v3-only access (same commands, local edits preserved, no compulsory flags/migration). Also test purchase of v4 leaves a bound v3 project unchanged. Preserve legacy v3 response shape/signature semantics and mutable R2 keys; v4 release fields must not become required for v3. Upgrade requirements apply to using v4 capabilities; warnings about old binaries writing migrated projects belong to the second release.

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


## Phase 7: Roll out backend protection, first-week content and CLI in order

**Repository**: Both

### Overview

Deliver the prepared system through a separately protected backend before publishing v4. This phase specifies future production side effects, after implementation review and operator-run release gates. Updating these documents does not execute or authorize production publication.

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

## Compatibility and handoff

First-release users can start a separate v4 project; an existing v3 project stays v3 until the second release provides explicit migration. V2/v3 manifests remain supported; corrupt, unknown and conflicting state blocks writes safely. Never relabel unknown historical provenance from names alone.

The second plan consumes release schema, signed map envelope, guarded release routes, binding/selection and ordinary file-safety helpers from this change. It adds real mapping, pending ownership and recovery atomically across all upgraded writers. No second-change criterion gates shipping this access release. Review migration contracts early without implementing them here.

## Findings Traceability

| Review finding | Plan resolution |
|---|---|
| F1 deletion/print | No event hooks; Phase 4 pure preview and Phase 5 underlying safe removal |
| F2 unknown-course bypass | Phase 2 deny unknown routes/aliases before R2; Phase 7 guard-before-upload |
| F3 identity grant loss | Phase 1 shared identity-preserving writes and lifecycle/failure regressions |
| F4 missing v4 delivery | Phases 2–4 auth/discovery, five lessons and common selector |
| F5 provenance/sync | Phase 4 binding and actual course propagation; Phase 5 profile ownership/freshness; edition migration is the second change |
| F6 artificial/expired E2E | Phase 6 actual auth+candidate matrix; Phase 7 real-account evidence |
| New master event endpoint | Phase 2 retirement while retaining normal v3 published course |
| New master get metadata bug | Phase 4 pass course at every writer boundary |
| New deployment ordering gap | Phase 3 scoped publishing; Phase 7 separate security release |

## References

- research.md — current source evidence and historical context.
- plan-brief.md — accepted first-release outcomes.
- decisions-record.md — authoritative accepted choices; split-map.md allocates decisions/criteria and evidence.md tracks unproven gates. The unchanged decisions.md/details documents remain the historical acceptance basis.
- Prior review: /Users/admin/code/10x-cli-unaited-worktree/context/changes/unaited-csc-access/reviews/impl-review.md.
- Toolkit context/changes/support-10xdevs-4/plan.md:237 — superseded CLI deferral.
- Toolkit context/foundation/lessons.md — self-contained skill support files.
- Bases: CLI f89f195; toolkit da989a6. Worktrees: /Users/admin/code/10x-cli-v4-delivery and /Users/admin/code/10x-toolkit-v4-delivery.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Preserve membership across course and identity changes

#### Automated

- [x] 1.1 Membership lifecycle regression matrix passes: `pnpm --filter @przeprogramowani/api test --run`. — Toolkit 7f0ce09; CLI 4787130; Toolkit review fix 5b5d1a5
- [x] 1.2 Injected write failures followed by retry preserve unrelated grants, v3 mirror and consistent current reverse identity. — Toolkit 7f0ce09; CLI 4787130; Toolkit review fix 5b5d1a5

### Phase 2: Authorize every content path and expose available courses

#### Automated

- [x] 2.1 Auth and route matrix passes: `pnpm --filter @przeprogramowani/api test --run`. — Toolkit e4757ab; CLI db8fc72
- [x] 2.2 A populated unknown-course R2 fixture is denied for empty/v3/v4 claims across every content endpoint; retired event path never returns bytes. — Toolkit e4757ab; CLI db8fc72
- [x] 2.3 Legacy-token, malformed-claim, callback revocation, refresh and discovery outage tests pass. — Toolkit e4757ab; CLI db8fc72

### Phase 3: Publish v4 week one independently and freeze the live v3 publication

#### Automated

- [ ] 3.1 Scoped build succeeds: `pnpm --filter @przeprogramowani/course-content build && pnpm --filter @przeprogramowani/course-content build:lessons --course 10xdevs4`.
- [ ] 3.2 Selected-bundle validation passes: `node packages/course-content/scripts/validate-bundles.mjs --course 10xdevs4`.
- [ ] 3.3 Pipeline regression tests prove stray/modified v3 and unknown dist directories never enter transforms or production PUTs; incomplete uploads do not publish a catalog.
- [ ] 3.4 Inventory tests cover pagination, full key/hash comparison and download failure; course-content tests pass: `pnpm --filter @przeprogramowani/course-content test`.
- [ ] 3.5 Source-resolution tests prove latest is resolved once, per-file pins take precedence, unpinned sibling files follow the course default, missing pinned inputs fail, and provenance/cache identity reflect the assembled sources.
- [ ] 3.6 Release tests prove incomplete uploads never become current, competing promotions do not overwrite each other, retained releases are immutable, and get/sync/migration read one selected release across every content route.

- [ ] 3.7 Curriculum coverage validation rejects missing/extra/cumulative/language/rules mismatches and passes for the reviewed v4 first-week specification.
- [ ] 3.8 Package-source tests verify file SHA over package SHA over course default, pinned tree membership, executable modes and cache invalidation.
- [ ] 3.9 Promotion gate proves manual selection of exact verified outputs, conditional create/update failure and competing-writer/rollback behavior through the actual production publisher path.

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

- [ ] 5.9 Ordinary rules preview/apply/opt-out preserve local or unknown-baseline blocks, shared owners and surrounding text; explicit resolutions and partial failures keep upstream hashes truthful.

### Phase 6: Verify candidate CLI and API together before release

#### Automated

- [ ] 6.1 Coordinated real-auth matrix passes: `E2E_CLI_PATH=/Users/admin/code/10x-cli-v4-delivery/dist/10x pnpm test:e2e:cli` from toolkit (CI uses its own exact checkout path).
- [ ] 6.2 Full clean toolkit gate passes: `pnpm ci:local`; CLI unit/type/lint/build/binary and `bun test tests/smoke/` pass.
- [ ] 6.3 CI records exact candidate SHAs and passes Windows checks; implementation review has no unresolved critical findings.


### Phase 7: Roll out backend protection, first-week content and CLI in order

#### Automated

- [ ] 7.1 Production publication probes verify complete v4 object inventory, unlocked module 1 and unchanged v3 key/hash inventory.
- [ ] 7.2 Post-deploy CLI/API smoke records the deployed revisions and succeeds without secrets in saved evidence.

#### Manual

- [ ] 7.4 Confirm intended v4 first-week materials, preview fixture rehearsal and secured-production real-account login/list/get/sync for v3-only, v4-only and dual-course users.
- [ ] 7.5 Review and execute the two-stage toolkit rollout followed by CLI publication; record successful account rehearsal and rollback-floor revision.
