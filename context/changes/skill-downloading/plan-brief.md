# Skill & Skill-Group Install — Plan Brief

> Full plan: `context/changes/skill-downloading/plan.md`

## What & Why

Learners want a skill, or the whole Core Skill Chain, without knowing which lesson delivers it. `10x skill <name> --install` and `10x skill-group <name> [--install]` do that. Without `--install` they show docs. Access uses the same auth as `10x get`, but nothing assumes a course, so a license grant can come later.

## Starting Point

- A single skill can be written only through `10x get <lesson> --type skills --name X`.
- `10x skill <name>` already shows overviews.
- The writer's ownership ledger (`manifest.lessons`) is keyed per lesson, and older CLIs read it with fixed rules.

## Desired End State

- `10x skill 10x-plan --install` and `10x skill-group core-skill-chain --install` write skills with full conflict protection and a JSON report.
- Older CLIs keep working on the same project.
- No `.10x-cli.json` is created or changed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Commands | `--install` on `skill`; new `skill-group` with docs by default | Decided with the user. |
| First group | frame, research, plan, plan-review, implement, impl-review | Decided with the user. |
| Locks | Ignored | Product decision. |
| Ownership | Reserved `skill:` / `group:` keys inside `manifest.lessons` | Every v3 CLI accepts them, protects their files and ignores them in `sync`. |
| Overlap with lessons | A standalone install defers to a lesson owner (`managed_by_lesson`) | Otherwise the two owners overwrite each other on every `sync`. |
| Rules ownership | Standalone entries always record `courseRules: false` | Without it, old and new rules logic would treat them as owning the rules block. |
| Project binding | Never created or changed | Older CLIs read `.10x-cli.json` strictly. |
| Course | `--course`, else the project binding, else the server's choice; the manifest uses the course in the response | Course is a hint, not the access model. |
| Compatibility | Additive only | Hard constraint. |

## Scope

**In scope:** types and fetchers, standalone writer mode, both commands, docs, verify-10x-cli feature, a check with the previous CLI.

**Out of scope:** licenses, signing in without a course, latest-from-master content, `sync` refreshing standalone installs, `--force`, list mode, uninstall.

## Architecture / Approach

1. Fetch from the new routes and verify the signature and release.
2. Wrap the response into a skills-only bundle whose `lessonId` is the owner key.
3. Run `planBundle` and `applyBundle` with `standalone` (no binding, defer to lessons, representation always recorded).
4. Render through `output.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Types and fetchers | Typed, verified access to the 3 routes | Must merge before the toolkit PR |
| 2. Standalone owners | Writer and manifest support | An older CLI misreading the manifest |
| 3. `skill --install` | Single-skill install | Course and tool resolution without binding |
| 4. `skill-group` | Group docs and install | A group shrinking (safe removal) |
| 5. Docs and verification | README, guide, verify feature, previous-CLI check | — |

**Prerequisites:** toolkit `skill-downloading` T1–T2 running locally, needed for Phase 1 types.
**Estimated effort:** about 3 sessions.

## Open Risks & Assumptions

- Generated skill variants can differ between lessons. Deferring to lesson owners keeps lesson projects consistent.
- Released before the toolkit deploy, the commands exit 1 with `*_unsupported`.

## Success Criteria (Summary)

- One command installs a skill or the Core Skill Chain into any project.
- Running a previous CLI version on the same project behaves normally.
