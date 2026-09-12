---
change_id: 10xdevs4-cli-access
title: Enable safe 10xDevs 4 login and first-week delivery across CLI and toolkit
status: impl_reviewed
created: 2026-09-07
updated: 2026-09-12
archived_at: null
---

## Current scope — 2026-09-12

First release only: access/delivery v4 and transparent v3 support. Canonical plan.md owns both repo scopes and its Progress. Second change: [10xdevs4-project-migration](../10xdevs4-project-migration/plan.md). Authority is decisions-record.md (SHA-256 prefix 3f877a33e03b); split-map.md and evidence.md record allocation and gates. Historical combined plan/review are snapshots under history/, not active execution inputs. Phases 1–2 passed their Automated gates and scoped implementation review after corrections. Phase 3 implementation is present but uncommitted. The complete stack-assess source repair is prepared as separate draft Toolkit PR #30 (e6e9f3f2e807d14019f0fe5cd087554f7dbd7864), based directly on master. The user approved merging that prerequisite separately and pinning its resulting master SHA in the dependent delivery change. Permanent-pin ancestry enforcement and real squash-history regressions are implemented locally; 134 course-content tests pass. The immutable v3 maintenance pin still awaits the actual prerequisite merge, so Phase 3 completion remains pending; see canonical evidence.md and follow-ups/source-closure.md. User approvals for week-one equivalence, current-master v3 cutoff and scheduled module-1 unlock remain valid, and isolated R2 capability preflight passed. No Phase 3 Automated criterion is complete. Phases 3–6 and phase 7 remain pending; phase 7 is outside execution authorization. Status retains only the completed partial implementation review of phases 1–2. Canonical CLI Progress is authoritative.

## Historical notes (superseded where the accepted record differs)

Ok, zaplanuj jak uruchomić wsparcie dla 10xdevs-4 w 10x-cli i 10x-toolkit, weź pod uwage swoje, naprawić i zabezpieczyć wykryte błędy, skorzystaj z 10xWorkflow CSC, w planach stawiaj na opcje rekomendowane ale przedstaw mi co chcesz osiągnąć zanim przejdziesz do implementacji. Samo Unaited jest już outdated, nie wdrożyłem kodu na event bo się nie wryobiłem, nie potrzebujemy go

Earlier requirement: v4-only members must already be able to log in and fetch first-week lessons through `get m1lN`; automatically choose the best available access for a new project.

Canonical cross-repository change: research, plan, brief and plan review live here. Toolkit carries a companion pointer under the same change-id; execution state lives only in this plan's Progress section.

Planning starts from CLI origin/master f89f195 and toolkit origin/master da989a6 in isolated worktrees. No event-branch merge, no implementation or deployment during this planning step. The user requests a concrete outcome presentation before implementation.

2026-09-07: User refinement added to the canonical plan: v4 defaults to latest published master sources with explicit per-file commit overrides; v3 uses a pre-v4 cutoff with maintenance-only changes. Source-selection delta awaits targeted plan review; application implementation has not started.

2026-09-07: User approved explicit v3-to-v4 project migration with preview, conflict resolution, backups, journal recovery and final whole-project binding/manifest commit. Canonical plan now includes a minimal immutable v4 release dependency. Unmapped v3 material policy is being clarified; targeted review covers the expanded source/publication/migration scope. No application code changed.

Targeted source/publication/migration review completed: technical corrections incorporated, verdict REVISE pending the unmapped-material policy. All 28 implementation criteria remain unchecked.

User correction: incremental v3-to-v4 migration replaces only currently unlocked v4 skills. Other installed v3 skills remain active, with original provenance and pending target recorded in manifests; later sync completes replacements as they unlock. This supersedes the archive/block proposal and resolves the product policy. Canonical plan has 30 pending implementation criteria; application code remains unchanged.

Incremental-migration follow-through reviewed against writer/manifest/sync: original product-policy question resolved by user; plan verdict SOUND after corrections. All 30 implementation criteria remain pending.

2026-09-09: Added decisions.md at the user's request: 16 decision cards with current/robust/agile variants, blank final-choice fields, relative costs, dependencies and 20 evidence tasks. Prior user decisions remain recorded; no alternative was silently selected or implemented.

2026-09-09: Reworked decisions.md into an executive brief at the user's request: business/product context before each decision status, concise alternatives and a single place for final choices. Preserved full comparisons, evidence tasks and sources in decisions-details.md. No plan behavior or implementation state changed.

2026-09-12: Split plan reviewed against the accepted record; SOUND after targeted corrections. Review covers planning only; every implementation criterion remains pending.
