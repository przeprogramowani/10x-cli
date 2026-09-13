---
date: 2026-09-07T09:30:00+02:00
researcher: Codex
git_commit: f89f19506cab8c9bbeb112242e4485fce4f1b77b
branch: plan/10xdevs4-cli-access
repository: 10x-cli + 10x-toolkit
topic: Safe v4 login, first-week delivery and reuse of reviewed code
tags: [research, access, course-selection, content-publication, data-safety]
status: complete
last_updated: 2026-09-12
last_updated_by: Codex
---

# Research: 10xDevs 4 delivery

## Update 2026-09-12

See [evidence.md](evidence.md) for fresh fetch and unchanged master SHAs, and [split-map.md](split-map.md) for accepted decision allocation. D03 B supersedes the copied-v3 curriculum assumption below; D05 adds whole-package pins and D15 separates migration. Earlier observations remain historical source evidence, not accepted alternatives or proof of implementation.

## Research Question

How to deliver v4 login and `get m1lN`, automatically select the best available course, address the reviewed safety bugs, and avoid deploying obsolete Unaited code?

## Authoritative baseline

- CLI `origin/master=f89f195`, toolkit `origin/master=da989a6`, both freshly fetched on 2026-09-07.
- Isolated planning worktrees: `/Users/admin/code/10x-cli-v4-delivery`, `/Users/admin/code/10x-toolkit-v4-delivery`.
- Reviewed but unmerged CLI branches: `get-by-name-rebased=a406047`, `unaited-csc-access=56ee9e6`; toolkit event code inspected at `db586a0`.
- User says the event branch was never deployed. No migration of event users is required. This does not establish deployment status of the separate historical endpoint already present on master.
- Prior review: `/Users/admin/code/10x-cli-unaited-worktree/context/changes/unaited-csc-access/reviews/impl-review.md`. All six findings are inputs; fresh research additionally traced publication ordering, master writer behavior and all routes.
- CSC research used two parallel agents: content/publication and CLI selection/filesystem semantics. Parent independently inspected membership writes, actual master routes, pipeline and key call sites.

## Summary

Membership provisioning for v4 exists, but CLI delivery does not. The narrow useful release needs existing membership preservation, complete course authorization, v4 first-week content, discovery, correct project binding and file safety. A wholesale event merge or changing a single default cannot achieve this.

## Detailed Findings

### Authentication and content authorization

- Toolkit master `packages/api/src/services/auth.ts:130` accepts v3 only; refresh repeats the rule.
- Master `packages/api/src/index.ts:46` authenticates API requests but does not check individual course access.
- Course routes read arbitrary R2 prefixes: `packages/api/src/routes/catalog.ts:69`; modules, lessons, artifacts and downloads have analogous paths. Uploading v4 first exposes it to existing valid JWTs.
- Event `course-access.ts:38` passes unknown slugs. A real route probe with an existing fake v4 R2 catalog returned 200 to `courses: []` and v3-only tokens. Guard registry must reject omissions, not assume R2 is empty.
- Master has a separate `/api/unaited-csc` route (`routes/unaited-csc.ts:14`) reading `10xdevs3/lessons/m0l2.json` without course authorization. Its clock exception has expired but JWT-only access remains. Retire the route as event-only, while preserving the existing published v3 objects.
- A missing legacy JWT claim can be checked against live KV rather than permanently granting v3. New claims must be strict arrays; malformed claims are not legacy.
- Discovery must distinguish active grants, published content and operational errors. An authorized newer course absent from R2 is different from an R2 outage.

### Membership preservation

- Master `services/circle-sync.ts:281` has `upsertCourseGrant`; `applyCourseChange` preserves other courses and recomputes v3 `hasAccess`.
- `reconcileSpaceMembers` indexes records by member ID and writes additions from the old scan at `:884`; it does not reconcile a different ID already attached to the same normalized email.
- Event manual writer introduces synthetic IDs. A reproduced service flow changes manual v4 to Circle v3 and loses v4; stale reverse index remains.
- Bulk sync reads by email (`:633`) but also leaves obsolete reverse IDs. Webhooks use the shared helper; email drift already detects ambiguous identity collisions. A common identity-merge/persist boundary must cover all these paths.
- This plan can fix sequential identity transition without adding the event manual-grant endpoint. Regression fixtures can construct the already-supported manual source directly.
- Existing KV writes are not transactional. Do not claim cross-request serializability from a fresh read/merge; this remains a stated infrastructure limit, separate from the reproduced sequential overwrite.

### First-week content and publication

- Master `packages/course-content/src/build/build-lessons.ts:17` builds only v3. No v4 definitions exist.
- Existing module 1 contains `m1l1–m1l5`; lessons accumulate artifacts from earlier lessons. Copy reviewed definitions into a separate v4 module, not an alias of the full v3 course.
- Shared artifact resolver reads live `packages/ai-artifacts`. Copying course definitions alone does not freeze v3.
- `scripts/transform-content.mjs` and `packages/api/scripts/r2-sync.mjs` enumerate all dist directories. Freeze requires explicit selected-course processing and a production upload prohibition for v3.
- Existing restore mode is a translation cache, not a backup: it omits catalogs and tolerates errors. Inventory/download actual published v3 keys and hashes separately.
- Toolkit `.github/workflows/ci.yml:199,268` uploads content before deploying Worker. First v4 publication must follow a separately deployed security preparation release.
- Upload lessons/variants successfully before the first v4 catalog; routes depend on the catalog. This makes interrupted first publication unavailable, rather than advertising partial content.
- Keep v3 bytes in place and prove unchanged key/hash inventory after rollout. Do not assume the historical proposed SHA `157667a` equals production today.

### CLI binding and filesystem safety

- `src/commands/get.ts:58`, `list.ts:26`, `sync.ts:49` hardcode v3. `get.runGet` does not pass resolved course to `applyBundle`; master writer therefore records v3 even for explicit alternate-course fetches.
- Master manifest accepts versions 2–3, already has a top-level course and per-lesson IDs. Branch v4/directSkills schema belongs to unmerged get-by-name; it is unnecessary for lesson delivery.
- Lesson IDs and physical paths collide between editions. One project course binding must precede content writes and survive partial I/O failure. Existing valid manifests seed the binding; conflicts/corruption must not mean “empty project.”
- Tool profiles can share root rule files; project-level binding avoids cross-profile edition mixing. An explicit alternate `--course` is safe for read-only viewing/new projects, not silent in-place replacement.
- `resolveToolProfile` writes preferences and can migrate/delete orphan artifacts even during print/dry-run. Pure selection must precede any effects.
- Master writer and tool-switch already recursively remove stale skill directories. The event hook amplifies this but excluding the hook alone leaves the underlying unsafe deletion primitive. Preserve edits/untracked files, inspect symlinks and remove only proven unchanged managed files.
- Tool-switch can drop source ownership after conflicts. A correct migration retains unresolved source records and establishes destination ownership only for files actually moved.
- Sync's digest shortcut also needs local-file/profile/language checks; a missing local file must not be skipped just because upstream digest is unchanged.

## Historical Context

`support-10xdevs-4/plan.md:237` explicitly deferred CLI delivery. The current user requirement supersedes that deferral. Event self-serve signup was a documented requirement amendment, not unauthorized drift; it is now obsolete.

## Verification Context

Prior review ran 602 CLI tests, 9 CLI smoke tests and 366 API tests successfully, with isolated reproductions of deletion, access-map omission and identity overwrite. Those were event-tree checks, not proof of this clean-master plan's implementation. This planning turn performs source/path/contract validation only. No production inventory, new tests, preview deployment or content transformation was executed.

## Planning Assumptions

Recommended initial v4 syllabus: the current committed toolkit's m1l1–m1l5 as independently owned v4 definitions, reviewed for v3-specific copy; v4 artifacts come from the eventual clean release commit. User was asked for an alternative authoritative source; no alternative has been supplied when this document was written. The plan makes this default explicit for review rather than claiming independent curricular equivalence.

## References

- [CLI master](https://github.com/przeprogramowani/10x-cli/tree/f89f19506cab8c9bbeb112242e4485fce4f1b77b)
- [Toolkit master](https://github.com/przeprogramowani/10x-toolkit/tree/da989a6f7d4963c275a98943e85d225baf426228)
- Prior implementation review referenced above.
- Toolkit `context/foundation/lessons.md`: skill support files must be packaged within each skill; no shared out-of-tree references.


## Follow-up Research — 2026-09-12: W04/W05/W08 only

Two read-only research agents inspected curriculum/cutoff authority and actual publisher/test-environment availability while Phase 1 implementation proceeded. No decision alternatives were reopened. Research bases remain CLI `f89f195` and Toolkit `da989a6`; implementation branch is `plan/10xdevs4-cli-access` in both specified worktrees.

### W04 — reviewed curriculum not found

Toolkit `packages/course-content/src/build/build-lessons.ts` imports only v3. Its module-1 definitions provide concrete v3 artifacts and `CLAUDE-m1lN` rules; these are not approval for v4. Sibling Edu `apps/edu-platform/workbench/lessons-schema.json` declares `10xdevs-3`; the v3 PL/EN authoring collections and registry do not supply an independent v4 delivery specification. Edu public v4 module descriptions and the marketing September 14 date do not declare the exact artifact/rule/language/cumulative matrix or effective module-state override. W04 therefore remains open: a reviewed independent v4 specification plus confirmed effective release schedule/KV is required before final build.

### W05 — candidate is not an accepted cutoff

Git confirms `157667a30ad52169ba489d3dccc4bfc36ad530af` is the 2026-08-06 fenced-SKILL transform fix. Source changes between it and `da989a6` include six files: 10x-plan, 10x-plan-review, 10x-roadmap, milestone-state support, v3 index and new m0l2. The relevant history includes `2355f74`, `0fe2fb9`, `8f1f23b`, `b7204ed`, `abc53b7`, `95f7bac`, `a0dae46`, `594f9ac`. The historical support plan defers the freeze; current accepted D04 A does not choose a full cutoff SHA or classify later maintenance. No accepted final cutoff/maintenance list was found. W05 remains open rather than treating all later source changes as maintenance.

### W08/W10 — existing path and test isolation

- Toolkit `packages/api/scripts/r2-sync.mjs` invokes ordinary Wrangler PUT for mutable catalog/lesson keys and retries failures; no conditional pointer client exists. Installed Wrangler 4.80.0 PUT implementation does not forward conditional headers in its allowed metadata headers. Platform S3/Worker conditional support does not prove the existing path.
- `packages/api/wrangler.toml` has only production bucket `10x-toolkit-content`; preview versions explicitly share live bindings. Fresh read-only bucket listing returned only this bucket; GitHub returned no configured environments. No isolated remote test target or R2/S3 credential path was established. W08 requires actual conditional create/update, competition, failed-condition and rollback probes through the eventual production publisher on an isolated target; no such trial was performed.
- Current CI automatically uploads content on eligible main/master pushes and then deploys Worker. The separate offline-artifact workflow reads R2 and writes GitHub release ZIP assets using --clobber; it is not another R2 uploader today. Operator r2-sync defaults remote; dev-seed/dev-watch select local writes. Both GitHub workflows remain active; no jobs were canceled and no settings changed.
- Read-only production metadata: 57 objects, 33.2 MB; lifecycle only aborts incomplete multipart uploads after seven days. This is not W06 byte inventory/backup or a release-growth measurement.

These findings do not block independent identity/auth work. They prevent closing the dependent Phase 3 criteria without new authoritative inputs/evidence. No calendar, curriculum, cutoff, identity map or mock publisher result was substituted.
