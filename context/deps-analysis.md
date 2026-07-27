# Dependency analysis — propose-only (overnight loop, 2026-07-28)

Deps loop iteration: analysis only, nothing bumped. Blast radius from the import
graph (`grep`/madge) crossed with `context/map/repo-map.md` risk zones. Policy:
majors always go to a human; patch/minor may be auto-bumped only with the full
gate (typecheck + lint + bun test, 8 pinned fails unchanged).

| Package | Current → Latest | Major? | Used by | Risk | Recommendation |
|---|---|---|---|---|---|
| `@types/bun` (dev) | 1.3.12 → 1.3.14 | patch | typecheck only | none | **safe to bump** in the next loop iteration with full gate |
| `@clack/prompts` (runtime) | 0.9.1 → 1.7.0 | **yes** (0.x→1.x) | `conflict-prompt.ts`, `auth-flow.ts`, `tool-prompt.ts`, `commands/auth.ts` — the interactive UX of auth + conflict flows (map risk zone: commands/lib co-change) | HIGH — 0.x→1.x API changes in the only runtime prompt lib; brownfield UX regressions won't be caught by unit mocks | human decision; if bumped, needs the e2e auth flow + manual smoke of conflict prompts |
| `typescript` (dev) | 5.9.3 → 7.0.2 | **yes** ×2 majors | whole repo typecheck | HIGH — TS 6/7 strictness changes; gate is typecheck itself | human; consider stepping 5.9 → 6.x first |
| `oxlint` (dev) | 0.16.12 → 1.76.0 | **yes** | lint gate | MED — new rules will shift the warning baseline (currently pinned at 2 deliberate) | human; pairs naturally with a lint-ratchet iteration that re-pins the baseline |
| `@types/node` (dev) | 22.19.17 → 26.1.2 | **yes** | typecheck | MED — engines say node >=20; types 26 may drift from runtime | human; align with the actual node target first |
| `conventional-changelog-angular` (dev) | 8.3.1 → 9.2.1 | yes | `scripts/auto-version.mjs` (release pipeline) | MED — release automation breakage shows up only on master pushes | human; test with a dry-run of auto-version.mjs |
| `conventional-commits-parser` (dev) | 6.4.0 → 7.1.1 | yes | same | MED | same batch as above |
| `conventional-recommended-bump` (dev) | 11.2.0 → 12.1.0 | yes | same | MED | same batch as above |

## Summary for the morning

- **1 safe bump queued:** `@types/bun` patch (loop can take it with the full gate).
- **1 high-risk runtime major:** `@clack/prompts` — touches the auth/conflict UX
  paths; deserves its own change with e2e coverage, not a casual bump.
- **The three `conventional-*` majors are one logical batch** (release pipeline);
  bump together with an `auto-version.mjs` dry-run as the gate.
- `typescript` and `oxlint` majors each interact with a gate itself — do them as
  deliberate, single-change iterations so the baseline re-pin is explicit.
