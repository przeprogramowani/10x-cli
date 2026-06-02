# Disable Course Rules — Plan Brief

> Full plan: `context/changes/disable-course-rules/plan.md`

## What & Why

Let users opt out of the **course rules block** that `10x get` injects into their
rules file (`CLAUDE.md`/`AGENTS.md`/etc.). Some people want only their own rules,
and disabling ours makes the CLI a better fit for use outside the course context.

## Starting Point

Today `applyBundle()` always writes `bundle.rules` as a sentinel-marked block into
the active tool's rules file (`writer.ts:270`). There's no way to skip it. The
strip primitive (`removeRulesBlockWithMarkers`) and a flag-writes-config pattern
(`--lang`) already exist — this feature composes them.

## Desired End State

`10x get --no-course-rules` applies skills/prompts/configs but not the rules block,
removes any block already present, and remembers the choice (`courseRules:false`
in `config.json`). `--course-rules` re-enables. An explicit `--type rules` request
still applies rules even when opted out. Default behavior is unchanged.

## Key Decisions Made

| Decision                  | Choice                                  | Why                                                              | Source |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------- | ------ |
| Scope of opt-out          | Rules block only (not configs)          | Matches the stated intent; keeps useful artifacts flowing        | Plan   |
| How it's exposed          | Flag + persisted config (flag wins)     | One-off override and set-and-forget for out-of-course use        | Plan   |
| Existing applied block    | Strip it on disable                     | "Disable" should mean the course rules actually leave the file   | Plan   |
| Naming                    | `--no-course-rules` / `courseRules`     | "course" disambiguates from the user's own rules                 | Plan   |
| Explicit `--type rules`   | Overrides the opt-out                   | Explicit intent beats a standing preference (least surprise)     | Plan   |

## Scope

**In scope:** the `rules` bucket only; a `get` flag (both directions); persisted
`courseRules` setting; strip-on-disable; explicit `--type rules` override; output
+ docs; fixing a latent config-clobber in the `--lang` persist path.

**Out of scope:** the `configs` bucket; any API/bundle/server change; a standalone
`config` subcommand; legacy `10x-toolkit` block handling; manifest-tracking rules.

## Architecture / Approach

Three thin layers, each defaulting to today's behavior: (1) `config.ts` — add
`courseRules?: boolean` + a merge-safe `updateToolConfig`; (2) `writer.ts` — an
`applyCourseRules` option on `ApplyOptions` that strips/skips the rules block;
(3) `get.ts` — register `--no-course-rules`, resolve a tri-state (argv flag →
config → default-on), persist explicit choices, force-apply on `--type rules`,
and render the result.

## Phases at a Glance

| Phase                              | What it delivers                                  | Key risk                                           |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| 1. Config schema & persistence     | `courseRules` field + merge-safe writes           | Clobbering other config fields if merge is missed  |
| 2. Writer opt-out & strip          | `applyCourseRules` flag, strip via sentinel markers| Damaging non-course content in the rules file      |
| 3. Command wiring & output         | Flag, tri-state resolution, override, rendering    | CAC can't tri-state a negated bool → argv check    |

**Prerequisites:** none — all primitives exist in-repo.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- CAC collapses default-on and explicit-`--course-rules` to the same value;
  resolution relies on an argv-token check (verified empirically).
- Strip is gated to full applies; a `--type`-filtered run must never touch the
  rules file. Tests must cover this gating.
- The strip path must run even when the server still ships a non-empty `rules`
  bucket — the flag, not the bundle, decides.

## Success Criteria (Summary)

- `--no-course-rules` skips and strips the block; other artifacts still apply.
- The choice persists; plain re-runs honor it; `--course-rules` reverses it.
- `--type rules` applies rules despite a persisted opt-out; default behavior and
  re-apply idempotency are unchanged.
