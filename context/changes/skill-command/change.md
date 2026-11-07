---
change_id: skill-command
title: "`10x skill <name>` shows a short overview of a 10x workflow skill"
status: implemented
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

Reverse-documented after implementation (PR #88, merged as cc0e820). The API and publisher are `context/changes/skill-overviews/` in przeprogramowani/10x-toolkit (PR #127).

Merged before the toolkit route was live, on purpose: the toolkit's "Coordinated CLI/API" job checks its candidate schema against CLI master's committed types, so the CLI types had to land first. Until the route deploys, `10x skill` exits 1 with `skill_overviews_unsupported`.
