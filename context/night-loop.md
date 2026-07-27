# Night loop runner

`scripts/night-loop.mjs` runs bounded, local Codex iterations against
`claude/context-loops-bootstrap`. It is intentionally narrower than the full
loop menu: config-only lint ratchets that already pass. Characterization work
is excluded until mutation proof can be executed mechanically; examples work
is excluded because its executable config cannot safely run in an unattended
outer gate.

## Safety contract

- Hard local-time deadline (default: the next `07:30`).
- One agent and one isolated git worktree at a time.
- Codex runs with `workspace-write`, `approval_policy=never`, and network
  disabled. The runner—not the agent—performs authenticated GitHub operations.
- Maximum 8 iterations and 800,000 reported tokens by default. A single Codex
  turn can overshoot the remaining token budget because usage is reported only
  after the turn; no repair or later iteration starts after the ceiling.
- One base commit is pinned for the entire run. If the remote base advances,
  the loop stops instead of comparing against a stale baseline.
- Exact differential gate: lint cannot regress; passing tests cannot decrease;
  the pinned set of 8 build-dependent failures must remain byte-for-byte the
  same. Characterization work must increase the passing-test count.
- At most two repair turns in the same Codex session. Persistent failure opens
  an `automation` issue and preserves the failed worktree for diagnosis.
- Successful iterations open one small PR each. The runner never merges PRs.
- Agent and gate environments omit credential variables. Codex and outer gates
  run without network; binary diffs and patches matching common secret formats
  are rejected.

The machine must remain awake and online. Saved Codex authentication and `gh`
authentication must already work.

## Review and dry run

```bash
bun test tests/night-loop.test.ts
bun run night-loop -- --deadline 07:30 --dry-run
```

## Start an overnight run

```bash
nohup bun run night-loop -- --deadline 07:30 \
  > .codex/night-loop-launcher.log 2>&1 &
```

State, command logs, final model outputs, and the final summary are written
under `.codex/night-loop/<run-id>/`. The directory is ignored by git.

Optional bounds:

```bash
bun run night-loop -- \
  --deadline 2026-07-28T07:30:00+02:00 \
  --max-iterations 4 \
  --max-total-tokens 400000
```
