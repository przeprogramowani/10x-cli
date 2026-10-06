---
change_id: check-updates
title: Command that tells an authenticated learner whether there is something new to pull
status: implementing
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

New command that answers "is there something new to pull" — only for authenticated users. Open question from the request: check the existing API first — can `sync` gain a parameter (e.g. a check-only mode), or is a new command needed?

Related in 10x-toolkit: change `release-changelog` (planned 2026-10-05) adds `GET /api/changelog?since=<version>|sinceDate=<date>&limit=` serving AI-written release changelogs (skills, prompts, rules, config templates) mirrored to R2 under `changelog/`. Prior art in this repo: `bulk-sync-update` (`10x sync` + per-lesson catalog `contentHash`).
