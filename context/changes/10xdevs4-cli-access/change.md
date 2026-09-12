---
change_id: 10xdevs4-cli-access
title: Enable safe 10xDevs 4 login and first-week delivery across CLI and toolkit
status: impl_reviewed
created: 2026-09-07
updated: 2026-09-12
archived_at: null
---

## Current scope — 2026-09-12

First release only: v4 access and first-week delivery with transparent v3 compatibility. Canonical CLI plan.md owns the only Progress tracker; accepted decisions-record.md remains unchanged. The separate 10xdevs4-project-migration change is excluded.

Implementation for phases 1–6 is present. Phases 1–2 have local commits. Phase 3–5 criteria and coordinated real-auth criterion 6.1 passed; the complete E2E matrix is 29/29, CLI unit suite 611 tests, smoke suite 10 tests, and actual isolated R2 publisher trial 11/11. The final full phases 1–6 implementation review found no unresolved code findings; its overall verdict remains NEEDS ATTENTION for outstanding verification. See canonical reviews/impl-review.md and evidence.md for precise scope, logs and limitations.

The user deferred PR #30 and instructed continued independent work. Its head remains an explicitly identified latest-source candidate, never a permanent source pin. Five additional missing shared progress documents are repaired locally with 25 passing parity tests and independent approval; the existing PR #30 alone does not contain these copies. Final v3 maintenance exceptions require the actual master SHA containing all required source repairs; full clean Toolkit verification and actual exact-commit Windows CI remain open. A review checkpoint for the remaining implementation is being committed for draft PR publication at the operator’s request; this does not mark the outstanding gates complete. Exact phase index snapshots remain retained. Merge, publishing-job suspension and production rollout are separate subsequent steps.

The approved week-one equivalence, v3 cutoff and module-1 unlock on 2026-09-14 at 08:00 Europe/Warsaw remain in force. Production publication stays disabled. The local manual guide has now been executed: all functional scenarios passed, with a repeated-sync update-count observation and browser/native-app limits recorded in the canonical manual-test-results-2026-09-12.md. Production Phase 7 remains pending. Draft branch publication is the current action; it does not authorize merge/deploy, production R2/KV writes, npm publication or real email. Status impl_reviewed records the completed review, not whole-change completion.

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
