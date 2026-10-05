# Diagnose the setup

A learner runs one command that reports whether they are signed in, whether the API is
reachable, whether the config directory is writable, whether the CLI is up to date and
whether the tool directory is usable.

## Sub-features

- `doctor-ok` reports every check as `pass` for a healthy setup.
- `doctor-auth-missing` reports the auth check as failing when signed out.

## How to get to it (user POV)

- Run `10x doctor`.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`.

- **Healthy.** Run `$V cli doctor -- doctor`. Exit `0`; `data.overall` is `ok`; checks
  `auth`, `api`, `config`, `version`, `tool-dir` are `pass`; the `api` check message names
  this run's `http://127.0.0.1:<port>`; the `config` check names the run's private config dir.
- **Human output.** Run `$V tty doctor-human -- doctor`, `$V wait-screen '10x exited'`,
  `$V screen doctor-human`.
- **Signed out.** Run `$V cli logout -- auth --logout`, then `$V cli doctor-anon -- doctor`.
  Exit `78` (`EX_CONFIG`, not one of the 0–5 codes); the envelope is still
  `status: "ok"` with `data.overall` `error`, `data.failed` `1` and the `auth` check `fail`.

## Gotchas

- The `version` check calls the real npm registry (`registry.npmjs.org`); its offline
  behaviour is not mapped yet. It is the only non-fake network call in this skill.
- A failing doctor exits `78` with a `status: "ok"` envelope; assert on `data.overall`
  and the exit code, not on `status`.
- The `api` check hits `/health`, which the fake API always answers; it proves wiring,
  not production health.
