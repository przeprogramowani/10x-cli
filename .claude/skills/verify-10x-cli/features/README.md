# 10x-cli verification map

This directory is the maintained source for verifying the user-facing behaviour of the
`10x` CLI. Read this index before driving the CLI, then use the matching feature file as
the recipe. `$V` is `.claude/skills/verify-10x-cli/scripts/verify.sh`, run from the repo root.

## Baseline preconditions

- `bun install --frozen-lockfile` has run in this checkout.
- `$V up` started this run: fake API on `http://127.0.0.1:<free port>`, private
  `XDG_CONFIG_HOME`, empty git-initialised project dir.
- `$V doctor` exits 0.
- Fixture course `10xdevs3`: `m1l1` and `m1l2` unlocked, `m2l1` locked (see `../SKILL.md`).
- Logged-in features start with `$V seed-auth`; the auth feature starts logged out.
- Never drive an instance or a project dir this run did not create.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise. Recipes
  mutate the project; start a new run (`$V down && $V up`) when you need a clean one.
- `$V cli <label> -- <args>` is the machine path (non-TTY, JSON envelopes); assert on
  `status`, `error.code`, `data.*` fields and the exit code, not on prose.
- `$V tty <label> -- <args>` is the human path (prompts, human output); wait on prompt
  strings with `$V wait-screen`, answer with `$V keys`.
- Pass `--tool claude-code` to `get` and `sync` in a fresh project.
- Treat every command as literal; keep quoted names and flags unchanged.

## Proof and skip reporting

- CLI proof: command, stdout, stderr and exit code (the `NN-<label>.*` files).
- Prompt proof: `.screen.txt` of the prompt and of the final state.
- Mutation proof: `$V snapshot` after the action, plus the relevant file contents. For
  dry runs, a snapshot before and after.
- Network proof: `requests.log` (copied into the evidence dir at `$V down`).
- Record the feature ID and entry point used with every artifact (`$V note`).
- Report an unreachable path with the attempted command and the unmet precondition. Do not
  report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible
behaviour, then exactly four H2 sections in this order: `Sub-features`,
`How to get to it (user POV)`, `Driving it with verify.sh`, `Gotchas`. Keep implementation
details out; name only user paths, stable handles, required state, commands and observable
proof.

## Features

- [Sign in and out](./auth.md) — magic-link login through the fake mailbox, status, logout.
- [Browse lessons](./list.md) — modules, lessons in a module, locked modules.
- [Get a lesson](./get.md) — apply, dry run, print, filters, errors, interactive conflicts.
- [Sync lessons](./sync.md) — upstream updates, preserved local edits, cheap skip, `--force`.
- [Toolkit changelog](./changelog.md) — baseline recorded by sync/get, new releases, `--since`, older backend.
- [Diagnose the setup](./doctor.md) — `10x doctor` report.

Not mapped yet: `10x helpers install` (offline, bundled skills), `10x bench`,
`10x bench-kit` (need `BENCH_BASE_URL`; the fake API does not serve them), Circle login
(`--method circle`), course `10xdevs4` release identities, `--lang pl`.
