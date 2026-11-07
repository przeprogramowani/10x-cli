---
change_id: skill-downloading
title: Install skills and skill groups without naming a lesson
status: implementing
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

`10x skill <name> --install` and `10x skill-group <name> [--install]`; without `--install` both show docs. The first group is `core-skill-chain`: 10x-frame, 10x-research, 10x-plan, 10x-plan-review, 10x-implement, 10x-impl-review. Cross-repo: the toolkit side is change `skill-downloading` in przeprogramowani/10x-toolkit (branch `skill-downloading`).

Decided so far:

- Access uses the same auth as `10x get <lesson>`, but course is only one kind of grant. A license grant comes later, so routes and CLI must not assume a course.
- Signing in without a course, licenses and latest-from-master content are out of scope.
- Module locks don't apply to these installs.
- Nothing may break backward compatibility: existing routes and responses, and what older CLIs read from the manifest and `.10x-cli.json`.
