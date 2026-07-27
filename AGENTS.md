# AGENTS.md — map for coding agents (Codex and others)

A map, not a manual. Details live in the pointed files; read them on demand.

## Orientation

- **What this is:** Bun + TypeScript CLI (`@przeprogramowani/10x-cli`) for the
  10xDevs course. Commands in `src/commands/` are thin orchestration over
  `src/lib/`; all HTTP goes through the strict-allowlist seam
  `src/lib/api-client.ts` with types generated into `src/generated/` (never
  hand-edit).
- **Start here:** `context/map/repo-map.md` — committed context map (territory,
  structure, risk zones, who to ask). Refresh: `bun run repo-map`; staleness
  gate: `bun run repo-map:check`.
- **Canonical code shapes:** `context/examples/catalog.md` — copy these
  exemplars (tests, lib modules, commands) instead of inventing shapes. Gate:
  `bun run examples:catalog:check`.
- **Full conventions, env vars, pitfalls:** `CLAUDE.md` (agent-agnostic content
  despite the name).

## Commands

```bash
bun install
bun run typecheck && bun run lint && bun test   # the differential gate
bun run build                                    # node-target bundle
```

Pinned baseline for loops: oxlint currently 2 warnings / 0 errors (both are
deliberate control-char sanitization — do not "fix" to pass); bun test has 8
pre-existing failures that are OFF-LIMITS: never touch them from an automated
loop, never let a change add to them.

## Engineering loops (delegable work)

`.agents/skills/loop-engineering/SKILL.md` defines the loop contract. Summary:
read the map → ONE smallest change per run → verify with the differential gate
above → open a small PR; a human merges. Never assert your own pass — the gate
scripts decide. New tests must fail on the broken code they characterize.
Escalate after 2 failed repair attempts instead of retrying.

Safe loop menu: lint ratchet (safe rule classes only), characterization tests
for map risk zones (`src/commands`, `src/lib`), examples-catalog upkeep,
dependency analysis (propose-only; majors always go to a human).
