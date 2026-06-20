# `10x sync` — Bulk Download & Update — Plan Brief

> Full plan: `context/changes/bulk-sync-update/plan.md`
> Research: `context/changes/bulk-sync-update/research.md`

## What & Why

Learners have no way to download all course lessons at once, refresh what they already
have, or see what changed since the course started — today it's a manual `list`/`get`
loop. We add `10x sync`: one command to bulk-download and to update-with-change-
visibility. A new per-lesson `contentHash` on the catalog makes "what changed" cheap.

## Starting Point

Enumeration is already one catalog call and safe re-apply already exists (`applyBundle`
three-way SHA-256 detection, non-TTY skip-default). The gaps: no multi-lesson
orchestration, no aggregate change report, no non-prompting preview, and **no cheap
upstream change signal** — though a per-artifact content hash already exists at build
time (`transform-content.mjs:100-101`) and just isn't surfaced on the catalog.

## Desired End State

`10x sync` refreshes already-downloaded lessons and reports "N updated, M unchanged, K
skipped (you edited them — run `10x get …` to take the update)"; `--all` pulls every
unlocked lesson; `--dry-run` previews; `--force` overwrites edits. Unchanged lessons are
skipped without a download because the catalog now advertises a per-lesson `contentHash`.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Repo scope | Both, backend-first | Sync gets cheap change-detection from day one; CLI still falls back if backend not yet deployed | Plan |
| Command | `10x sync` (new) | Names the download+update+diff intent; matches team's structural-over-flags taste | Plan |
| Default mode | Update `manifest.lessons`; `--all` for everything | Safe default won't pull skipped lessons; `--all` serves the bulk-download ask | Plan |
| Conflicts | Skip + report; `--force` overwrites (bypasses digest gate) | Bulk sweep stays non-interactive; user work never lost; `--force` opt-in | Plan |
| Report | Per-resource remediation commands | Every not-updated resource shows the exact `10x get …` to fetch it | Plan |
| Per-lesson digest | Aggregate of per-artifact `contentHash`es (version-mixed), written in transform step | Changes on source edits AND `SYSTEM_PROMPT_VERSION` bumps → no silently-skipped re-translations; a plain base-source hash would false-negative on bumps | Plan (revised after mechanics check) |
| Exit code | Worst-outcome wins | Scripts/CI reliably detect any failure; report still shows partial success | Plan |
| Change-visibility scope | Skills + prompts only | Configs not hashed, rules sentinel-managed | Research |

## Scope

**In scope:** `10x sync` command; catalog `contentHash` (course-content build + API
schema); `planBundle()` writer refactor; manifest per-lesson digest; actionable report;
tests + docs across both repos.

**Out of scope:** config/rules change reporting; per-`{tool,lang}` digest;
`If-None-Match`/304; new bulk/diff endpoint; retry/backoff framework; changes to `get`.

## Architecture / Approach

Backend publishes a per-lesson base-variant digest on `/api/catalog`. The CLI stores that
digest per lesson in the manifest on apply and compares new-vs-stored (digest-vs-digest)
to skip unchanged lessons without fetching. A pure `planBundle()` lets `sync` classify and
preview without writing/prompting; `applyBundle` consumes the same planner so behavior
can't drift. The sweep accumulates per-lesson outcomes and emits one envelope with
worst-outcome exit code.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend digest | Per-lesson `contentHash` on the catalog | Digest must be deterministic + base-variant |
| 2. Writer refactor + types | `planBundle()` + regenerated types | `planBundle`/`applyBundle` parity; type-regen blocked on Phase 1 deploy |
| 3. `10x sync` command | The command + actionable report + exit codes | Orchestration, partial-failure, report UX |
| 4. Tests & docs | Coverage + README/CHANGELOG/contracts | Keeping docs in sync with real behavior |

**Prerequisites:** Phase 1 deployed before Phase 2's `generate-types`. Auth working
against the target API.
**Estimated effort:** ~3-4 sessions across 4 phases (backend small; the sync command +
tests is the bulk).

## Open Risks & Assumptions

- Backend is deployed first (confirmed), so Phase 2's `generate-types` has the field;
  the CLI still keeps the always-fetch fallback for a catalog without `contentHash`.
- Digest correctness rests on the failure asymmetry: false positives (over-fetch) are
  harmless because the writer re-checks real content; false negatives (silent skip) are
  the danger, which the version-mixed aggregate is designed to avoid.
- Residual benign false positive: Claude-tool users re-fetch on a `SYSTEM_PROMPT_VERSION`
  bump even though their delivered (source) bytes are unchanged; writer reports unchanged.
- Cheap-skip reports upstream state only — it won't detect/repair a user's local edit when
  upstream is unchanged; `get` or `--force` handles that. A plain `get` between syncs may
  cause one redundant fetch on the next sync.
- Determinism assumption: per-artifact hashes are stable across CI runs for unchanged
  content (they are — `sha256("v4:"+source)`, source from git); executable-bit flips would
  perturb a base-bundle hash but the aggregate keys off artifact hashes, not file modes.

## Success Criteria (Summary)

- `10x sync --all` populates a fresh project; re-run with no upstream change downloads
  nothing and reports all unchanged.
- An edited skill is reported skipped with a copy-pasteable command that takes the update;
  `--force` overwrites; `--dry-run` writes nothing.
- A partial failure exits non-zero while still emitting the full report.
