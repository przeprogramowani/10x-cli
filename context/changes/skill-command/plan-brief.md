# `10x skill <name>` — Plan Brief

> Full plan: `context/changes/skill-command/plan.md`

## What & Why

Learners meet many 10x skills and forget which one fits the moment. `10x skill <name>` answers in the terminal, next to the work: where the skill sits in the workflow, the problem, the solution, when to use it, what it writes and what to run next.

## Starting Point

`10x changelog` already renders toolkit-generated text with course scope, validation, sanitizing and semantic exit codes. The toolkit now serves skill overviews at `GET /api/skill-overviews` (10x-toolkit `skill-overviews`).

## Desired End State

`10x skill 10x-plan` (or `/10x-plan`, `$10x-plan`, `plan`) prints a compact entry in English or Polish for the project's course; a typo suggests close names; piped output is JSON.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data source | Toolkit API, whole course-scoped list | The text follows the skills without CLI releases, and suggestions need no extra endpoint. |
| Course scope | Reuse `resolveCourseScope()` from `changelog` | Same behaviour as the existing command; a 3.0 project gets 3.0's version. |
| Names | Accept `/`, `$`, any case, bare `plan` | Matches how learners type skills in Claude Code and Codex. |
| Unknown skill | Exit 5 with suggestions | Scripts can tell a typo from a failure. |
| Route missing | `skill_overviews_unsupported`, exit 1 | Lets the CLI ship before the toolkit route deploys. |
| Output | Sanitize, wrap, then style | All text is remote-controlled. |

## Scope

**In scope:** command, API client and types, tests, docs, verify-skill feature.

**Out of scope:** generating text, caching, a listing mode.

## Architecture / Approach

`10x skill <name>` → resolve course scope → `GET /api/skill-overviews?course=&lang=` → validate → find the normalized name (else suggest) → render through `output.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API client and types | Typed fetch and validation | Types drifting from the toolkit schema |
| 2. Command | Names, scope, rendering, errors | Over-loose typo suggestions |
| 3. Docs and verification skill | README, guide skill, fake-api route | Docs out of step with flags |

**Prerequisites:** toolkit PR #127 deployed and overviews published for production use.
**Estimated effort:** one session, reverse-documented after implementation.

## Open Risks & Assumptions

- Until the toolkit route is live, the released command exits 1 with `skill_overviews_unsupported`.
- Text quality depends on the toolkit's free-model output.

## Success Criteria (Summary)

- A learner gets a useful entry in a few lines without leaving the terminal.
- 3.0 and 4.0 projects each see their own version of a skill.
