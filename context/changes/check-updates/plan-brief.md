# `10x changelog` — Plan Brief

> Full plan: `context/changes/check-updates/plan.md`

## What & Why

Learners can't tell what changed in the course's skills, prompts, rules and config templates since they last pulled. `10x sync` will remember which 10x-toolkit release a project was synced at, and a new `10x changelog` command shows the AI-written release changelogs published since then.

## Starting Point

`10x sync` already detects stale downloads by comparing catalog content hashes, but nothing records which toolkit release a project corresponds to, and there is no "what changed" surface. The toolkit's planned `GET /api/changelog` (change `release-changelog`) serves changelog entries filtered by `since` version or `sinceDate`.

## Desired End State

After a sync, `10x changelog` answers "nothing new since v2.59.2" or prints the newer releases' changelogs. `--since <version|date>` browses history. On a backend without the endpoint, sync and get behave as today and the command says the backend doesn't support it yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Surface | New `10x changelog` command | Follows the structure-over-flags precedent from `bulk-sync-update`, and the name also fits browsing history. |
| What it answers | Toolkit changes since the last pull; download staleness stays with `10x sync` | Content comparison already works; what's missing is the explanation. |
| Baseline | `toolkit.version` in the project manifest, recorded by sync and successful get | Per project matches what was actually pulled there. |
| Fallbacks | No version → newest `appliedAt` as `sinceDate`; no manifest → latest 5 + hint | Existing projects get a useful answer before their next sync. |
| Recording rule | After a non-dry-run with no errored lesson; silent on any changelog failure | The baseline must never claim more than was pulled, and sync/get must never break because of it. |
| Exit code | Always 0; JSON carries `newEntries` | Consistent with `list`/`sync`; doesn't break scripts. |
| Old backends | 404 → `changelog_unsupported` | Same pattern as `discovery_unsupported`; the CLI can ship before the toolkit deploy. |

## Scope

**In scope:** `fetchChangelog` client; manifest `toolkit` field; recording in sync/get; `10x changelog` with `--since`/`--limit`; tests; README, guide skill, CLAUDE.md; fake-API route and verification doc; generated types after the toolkit deploy.

**Out of scope:** content diff inside the command; hints after other commands or background checks; non-zero "news" exit code; global baseline; markdown rendering; toolkit-side work.

## Architecture / Approach

```
10x sync / 10x get ──(success)──► GET /api/changelog?limit=1 ──► manifest.toolkit.version
10x changelog ──► baseline (flag > manifest version > last appliedAt > none)
              ──► GET /api/changelog?since=…|sinceDate=…|limit=5 ──► print entries
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Client + baseline recording | `fetchChangelog`, manifest field, recording in sync/get | Overwriting lesson ownership with a stale manifest copy; mitigated by re-reading before the write |
| 2. `10x changelog` | Command, baseline resolution, JSON envelope, tests | Boundary semantics drifting from the toolkit contract |
| 3. Docs, verification, types | README/skill docs, fake-API route, generated types | Types only after the toolkit endpoint is deployed |

**Prerequisites:** none for Phases 1–2 (fake API and hand-written type); toolkit `release-changelog` Phase 4 deployed for generated types and the production check.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Toolkit releases can include internal or not-yet-promoted changes, so the docs present the changelog as context, not as the list of things to download.
- Recording takes the newest release at sync time, not the exact release the content was built from; that's close enough for "what's new since I last pulled".

## Success Criteria (Summary)

- A synced project shows "no changes" until a newer toolkit release lands, then shows exactly the newer releases.
- Nothing about sync/get output or exit codes changes, with or without the endpoint.
