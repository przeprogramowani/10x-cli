---
change_id: multi-tool-profiles
reviewed: 2026-07-27
verdict: match
---

# Implementation review

## Verdict

MATCH. The implementation realizes the approved plan without changing the
single-target contracts or the remote bundle schema.

## Plan-to-code trace

- Configuration keeps `tool` as the default and adds a validated, ordered
  `tools` collection. Legacy configuration normalizes to one active profile.
- `--tool claude-code,codex,cursor` provides a deterministic, non-interactive
  route for the live demo.
- A later interactive invocation offers to add another active tool while
  preserving the existing default.
- `get` fetches and applies a tool-specific bundle for every active profile.
  Multi-target output is aggregated and labelled; single-target output keeps
  its previous envelope.
- `sync` evaluates manifests and cheap-skip state independently per profile,
  then fetches and applies changed lessons for each target.
- Active peer profiles are excluded from migration-orphan prompts.
- `--print` rejects multiple targets instead of producing ambiguous output.

## Intentional implementation choice

The explicit multi-target selector is a comma-separated `--tool` value rather
than a terminal multiselect. This keeps automation and the webinar path
deterministic while the second-call prompt still supports interactive
discovery.

## Known boundary

Multi-target operations fail fast on a target-specific network error. Earlier
targets may already have been applied. Automatic rollback or recovery was an
explicit non-goal in the approved plan.

## Verification

- `bun run typecheck` — passed.
- `bun run lint` — passed with two pre-existing `no-control-regex` warnings in
  `src/lib/output.ts`.
- `bun run build` — passed.
- `bun run build:binary && bun test` — 476 passed, 0 failed.
- Coverage includes a three-target `get`, a three-target `sync`, legacy config,
  ordering/de-duplication, orphan handling, and adding a tool on a later TTY
  invocation.

## Drift, missing, extra

- Drift: none affecting the approved behavior.
- Missing: none.
- Extra: `.demo-state/` is ignored to prevent webinar credentials and local
  configuration from entering Git.
