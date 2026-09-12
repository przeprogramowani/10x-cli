<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Safe 10xDevs 4 CLI delivery

- **Plan**: ../plan.md
- **Mode**: Deep
- **Date**: 2026-09-07
- **Verdict**: SOUND after incremental-migration corrections. User resolved the remaining policy: retain unavailable v3 skills active and advance them through later sync.
- **Findings**: Original findings and later policy question resolved; incremental-migration follow-through incorporated. No pending product decision or unresolved critical finding identified in this review.
- **Boundary**: Planning readiness only. No implementation, production readiness or permission to deploy is asserted.

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS with explicitly stated KV/concurrent-filesystem limits |
| Plan Completeness | PASS |

## Grounding

Parent verified 17 existing source/workflow paths, actual auth/course/writer/membership symbols, both fetched master revisions, and the mechanical phase/Progress contract. Independent reviewer verified backend/publication risks against the clean toolkit worktree and rechecked the corrections below. Brief and full plan describe the same seven stages, initial five lessons, v3 freeze and event exclusion.

New files are explicitly identified as new. Command selectors and discovery/binding schemas are proposed contracts, not falsely described as already implemented. Existing published API paths and v3 membership mirror are preserved.

## Findings

### F1 — Retry and backfill can preserve the wrong email identity

- **Severity**: CRITICAL
- **Impact**: MEDIUM — focused recovery contract across existing membership services.
- **Dimension**: Blind Spots
- **Location**: Phase 1.
- **Detail**: Existing email migration can update new email/reverse state and fail deactivating the old email; retry then returns no_drift. Backfill can overwrite the current reverse record with an old tombstone depending on listing order. A generic “retry preserves identity” requirement was insufficient and the initial collision wording could incorrectly reject legitimate same-ID email changes.
- **Fix**: Explicit pending email-migration recovery record, replay before no-op decisions, tombstone precedence, same-verified-ID email-change support, failure/restart/list-order tests.
  - Strength: Makes the interrupted state identifiable and recoverable without migrating storage infrastructure.
  - Tradeoff: Adds a small durable recovery record and its lifecycle.
  - Confidence: HIGH — matches the inspected write order and retry conditions.
  - Blind spot: Does not make KV cross-request writes transactional; this remains explicit in the plan.
- **Decision**: FIXED in Phase 1; independent reviewer rechecked.

### F2 — Discovery did not provide the aliases expected by the CLI

- **Severity**: WARNING
- **Impact**: LOW — contract alignment across a bounded set of call sites.
- **Dimension**: Plan Completeness
- **Location**: Phases 2 and 4.
- **Detail**: CLI text referenced registry-provided aliases, while discovery returned only canonical id and API slug. Existing handlers read their raw course param independently of middleware, so guard normalization alone would not fix R2 and module-state lookup.
- **Fix**: Accept exactly returned id/slug spellings; normalize both in authorization and every handler's storage/state lookup; include hyphenated-course matrix through catalog/lesson/artifact/ZIP.
- **Decision**: FIXED in Phases 2 and 4; independent reviewer rechecked.

### F3 — An old publishing job can break the v3 freeze after inventory

- **Severity**: WARNING
- **Impact**: LOW — concrete operational prerequisite before rollout.
- **Dimension**: Blind Spots
- **Location**: Phase 7.
- **Detail**: Disabling new publishing jobs does not stop queued/running workflows checked out at an older revision. They could still upload v3 after its baseline or after the secured Worker release.
- **Fix**: Establish a quiet boundary, finish or explicitly cancel old publishers/deploy jobs, verify no old uploader can proceed, block new triggers, then inventory/freeze and release preparation. Publication stays disabled until secured production API verification.
- **Decision**: FIXED in Phase 7; independent reviewer rechecked.

## Additional parent corrections

- Put the user-requested outcome review before Phase 1, not as an execution checkpoint buried in Phase 7.
- Specify snapshot/compare inventory command contracts and runtime package export for plain Node scripts.
- Honor current API-host and signing-key restrictions: pre-release candidate CLI runs on loopback fixtures; production real-account rehearsal occurs after the protected API/content rollout but before npm publication. No general hostname or signing-key override is introduced.
- Preserve binding on partial content-write failure; new project is not considered unbound merely because the final manifest write failed.

## Scope and assumptions for user review

- User has requested recommended choices and no implementation before outcome presentation. The plan is the concrete result for that checkpoint.
- Initial first-week recommendation is the current committed m1l1–m1l5 copied into independent v4 definitions. No alternative source has been provided. This is an explicit recommended content choice, not claimed verification of a separate syllabus.
- No event branch was deployed according to the user; therefore no event install/grant migration is needed. A separate historical endpoint on current master is retired.
- V3 preservation is verified against actual live byte/key inventory during rollout, not an assumed old Git SHA.
- All 7 implementation phases and their original 22 success criteria remain pending; planning does not make these checks passed.
- Existing KV eventual consistency and ordinary mutable later v4 updates are stated limits. The plan fixes the demonstrated sequential overwrite and first-publication exposure without claiming a new transactional database or immutable release system.


## Subsequent user direction — source revisions (2026-09-07)

Phase 3 now adds a common course-default/per-file commit resolver: v4 latest master by default, file pins override it, missing inputs fail, and provenance/cache inputs reflect the assembled files. V3 cutoff/maintenance policy is distinguished from the unchanged live-v3 rollout guarantee. Criterion 3.5 brings the current plan to 23 pending criteria. This delta was added after the independent review above; the change status returns to planned pending targeted review. No implementation or deployment has occurred.

## Expanded-scope targeted review — publication and project migration (2026-09-07)

The user approved explicit v3-to-v4 migration: release selection, preview, conflict resolution, backup, recoverable journal and final whole-project metadata commit. The updated plan adds the minimal immutable-release dependency, per-file source pins and 5 new checks (28 pending criteria total across the existing 7 phases). No application code, implementation phase or production action has been executed.

### Grounding and independent verification

Independent reviewer inspected and rechecked `src/lib/tool-profile.ts`, `manifest.ts`, `writer.ts`, `sentinel-migration.ts`, get/sync callers, API catalog/modules/lessons/artifacts/download routes and `lib/lang-resolver.ts`. Grounded risks: several profiles share one AGENTS.md block; rules currently have no recorded hash; old readers treat unsupported manifest versions as absent; every content route and language fallback currently constructs mutable keys. Parent checked phase/Progress equality and applied the concrete corrections below.

### Technical corrections incorporated

- One desired output per physical path across all profiles; curated cumulative lesson ordering and final rules source, with missing rules baseline treated as a conflict. Preserve text outside managed blocks and refuse ambiguous sentinel truncation.
- Whole-project write lock and journal, before/after hashes plus immutable plan digest, verified backup/staging, terminal metadata commit, offline recovery and conflict handling for post-apply edits. Missing/corrupt recovery data fails explicitly.
- Retained immutable release objects and current-pointer promotion. Pass selected release through all routes and both primary/fallback language paths, all CLI fetch modes and the sync sweep; bind course/release/manifest hash in signed responses.
- Explicit `migration-map.json` object included in release inventory and uploaded before final manifest/pointer. Add final manifest hash at API response signing rather than inside stored objects whose hashes it depends on, avoiding a hash cycle.
- Old CLI incompatibility stated truthfully: new metadata/schema cannot retrofit its missing write guard. Binding-before-write applies to ordinary initial installs; migration binding commits last under active journal protection.

### F4 — Unmapped v3 material policy

- **Severity**: WARNING
- **Impact**: MEDIUM — determines whether projects beyond currently published v4 content can migrate.
- **Dimension**: End-State Alignment
- **Location**: Phase 5, subsection 3; brief remaining product decision.
- **Detail**: V4 initially publishes only week one. Completing migration requires an explicit policy for managed v3 material without an equivalent; silently retaining old active skills mixes editions.
- **Recommended fix**: Archive listed managed files outside active tool discovery paths after preview acceptance, preserving backup and explicit local/untracked collision resolution. Alternative: block that migration until equivalents exist.
- **Decision**: RESOLVED by explicit user correction: neither archival nor blocking. Retain unavailable v3 skills active with original provenance and pending v4 target; replace them through later sync as counterparts unlock. The earlier recommendation above is superseded.

### Implementation-entry checks

The exact v3 cutoff and curated migration map still require source-history/curriculum verification before their Phase 3/5 code is finalized; the historical SHA is a candidate, not approved fact. Concrete conditional pointer-write support must be verified against the actual R2 API during implementation and competing publisher tests must pass. These are bounded engineering/content verification tasks, not additional permission questions. Original review findings remain resolved; this review does not claim implementation or deployment readiness.

## User correction and incremental-migration review (2026-09-07)

The user explicitly rejected both archive/block and the suggestion to deliver future-week skills early. Only currently unlocked v4 replacements are applied; installed v3 skills remain active and tracked until later v4 availability. This supersedes the earlier F4 recommendation and closes the product question.

Independent code verification identified required follow-through in `writer.ts` (lesson-ID overwrite, explicit manifest rebuilding and stale-file protection), `manifest.ts` (`buildUnionFiles`), and `sync.ts` (installed-lesson filtering and digest skips). Phase 5 now specifies:

- One v4 project target and versioned per-artifact transition ledger, with genuine source course, course-qualified source lesson ownership, paths/hashes, pending/conflict/applied state and known target identity. Never fabricate unknown source revisions or mark retained v3 material delivered as v4.
- Aggregate protection for pending paths across get/sync/force/filtered writes/profile switches, preservation of transition fields on every manifest rewrite, and removal of legacy ownership only after complete successful skill replacement.
- Pending evaluation before installed-lesson filtering and digest shortcuts; live clock/KV unlock checks even on the same release. Mapping to a not-yet-downloaded target lesson is valid. Fetch only authorized mapped artifacts and necessary support files; do not install unrelated lesson contents or overwrite rules as a side effect.
- Default pending sync across recorded profiles, honest deferred counts for explicit filters, per-file local conflict protection, complete-skill recovery and truthful status changes.
- Transaction completion with pending artifacts is valid and releases the write lock; pending content is not an unfinished filesystem transaction. Initial and later continuation rollback restore their own before-state.

Mechanical verification: 7 phase headings mirrored in the sole Progress section, 30 matching unchecked criteria. New 5.7/5.8 cover the accepted policy and unlock/cleanup/provenance regressions; existing reviewed step titles remain unchanged. No application code or tests were run/implemented by this documentation update. Source cutoff and curriculum mapping still require the previously recorded evidence work; neither is represented as already verified.
