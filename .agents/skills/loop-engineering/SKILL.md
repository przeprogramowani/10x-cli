---
name: loop-engineering
description: Run budgeted, evidence-driven engineering loops on top of the committed context map — lint ratchet, risk-zone test coverage, examples catalog, refactor, dependency bumps. Use when asked to run a loop, pay down lint/test/refactor debt safely, or keep the repo healthy on a budget. Orchestrate on Fable, delegate each iteration to Opus.
---

# Loop engineering

Repeatable passes on the context map. Each: read the map → pick the costliest target by
evidence → make ONE change → verify against a hard gate → commit → refresh the map if
structure moved. Loops propose; a human merges each one-change PR.

## Model policy

Orchestrate cheaply on **Fable** (plan, sequence, gate); delegate every edit/iteration
to an **Opus** sub-agent (`Agent({ model: "opus", … })`). Never let the orchestrator do
the implementation itself.

## Every loop, non-negotiable

1. **Pin the baseline first** — lint warnings/errors count and the exact failing-test
   set (`bun run lint`, `bun test`). The gate is differential: a loop may only reduce
   lint / raise pass-count, never add a failure. Pre-existing failures (if any) are pinned and
   untouchable from a safe loop; this repo's unit suite is currently fully green.
2. **One change per iteration, one PR per iteration.**
3. **A monotonic exit metric** (lint → 0, cycles ↓, risk coverage ↑). No metric, no loop.
4. **Safe rules first** (autofix/mechanical/report-only) before judgment or behaviour
   changes. Refactors change no behaviour — tests are the contract.
5. **The map is the prioritiser** — target the costliest item by evidence; refresh with
   `bun run repo-map` after structural change.

## The loops (effect-to-risk order)

- **Lint ratchet** (start here): `bun run lint` (oxlint) to zero warnings; then tighten
  `.oxlintrc.json` one rule per iteration. Gate = lint ↓ and failing-test set unchanged.
- **Risk-zone test coverage** (parallel, zero prod risk): characterization tests for the
  top untested churn×coupling module (see the map's risk zones — `src/commands`,
  `src/lib`). Gate = new tests pass, pass-count ↑.
- **Examples catalog**: keep `context/examples/catalog.md` pointing at real, lint-clean
  exemplars; gate = `bun run examples:catalog:check`.
- **Refactor** (needs test net): break one cycle / extract one hub; gate = tests green,
  no behaviour change, cycle count ↓. (Map currently reports zero cycles — this loop is
  dormant until one appears.)
- **Dependency bumps**: one package/group; gate = build + test green; majors → human.

See `context/map/repo-map.md` risk zones for what to target first.
