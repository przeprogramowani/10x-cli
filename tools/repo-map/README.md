# repo-map — wide-scan engine

Generates a committed **base map** of this monorepo from cheap, deterministic CLI
signals (git history + import graph) that run *outside* any model's context window.
The map is the reusable context layer: agents read it first and add a thin
task-specific Deep Focus, instead of re-scanning the repo on every request.

This is the "Wide Scan → Deep Focus" method from _10xDevs 3, module 4_ (M4L2),
turned into a repeatable engine + a Claude Code skill (`.claude/skills/repo-map`).

## Run

```bash
npm run repo-map          # regenerate context/map/* from the current HEAD
npm run repo-map:check    # exit non-zero if the committed map is stale (CI uses this)
```

Needs `npm install` first so `madge` and `dependency-cruiser` can resolve imports.
If they are missing the git-based layers still generate and the gap is recorded as
a limitation in the output.

## Output (`context/map/`)

| File | Question it answers |
| --- | --- |
| `repo-map.md` | The synthesized map: TL;DR, terrain, coupling, risk zones, who to ask, first files, limitations. |
| `artifact-1-territory.md` | Where the work happens (git churn, quarterly trend, co-change). |
| `artifact-2-structure.md` | How it is built (module inventory, import cycles, fan-out coupling). |
| `artifact-3-contributors.md` | Who has context on which area (humans; bots filtered). |
| `graph/cycles.json` | Raw `madge` circular-dependency list. |
| `graph/coupling.json` | Compact `dependency-cruiser` folder coupling (Ce/Ca/instability). |

All are marked `GENERATED` and are overwritten — never hand-edit them.

## Tune

Everything project-specific lives in [`config.mjs`](./config.mjs): the module list,
scan window (`since`), churn bucket depth, noise filters, and the primary module the
structural graph zooms into. Add an app under `apps/` → add it to `modules` so it
shows up instead of hiding in "other".

## Layout

- `config.mjs` — what to scan (data only).
- `lib.mjs` — git/exec helpers, noise filters, markdown/table helpers.
- `scan.mjs` — the three scans + synthesis + `--check` mode.

## Refresh automation

`.github/workflows/repo-map-refresh.yml` regenerates the map on a schedule and opens
a PR when it drifts — so the base map stays fresh with zero LLM cost, and every other
query gets cheaper because the territory work is already committed.
