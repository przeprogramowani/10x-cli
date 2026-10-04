# Sync lessons

A learner updates every lesson they already downloaded (or every unlocked lesson) in one
command, sees what changed upstream, and keeps any file they edited locally unless they
explicitly force a replacement.

## Sub-features

- `sync-update` applies upstream changes to downloaded lessons.
- `sync-preserve` skips locally edited files and reports them as conflicts.
- `sync-dry-run` reports the same classification without writing.
- `sync-cheap-skip` skips lessons whose catalog digest and local state are unchanged.
- `sync-all` also fetches unlocked lessons never downloaded.
- `sync-force` replaces edited skills and prompts.

## How to get to it (user POV)

- Run `10x sync --tool claude-code` (downloaded lessons only).
- Add `--dry-run`, `--all`, `--force` or `--module <n>`.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`, then `$V cli get -- get m1l1 --tool claude-code`.

- **Local edit.** Append to a delivered prompt:
  `echo "local edit" >> <project>/.claude/prompts/verify-fixture-prompt.md`.
- **Upstream change.** Run `$V bump m1l1`. It prints `"version":2` and a new `contentHash`.
- **Preview.** Run `$V snapshot before-sync`, `$V cli sync-dry -- sync --dry-run --tool claude-code`,
  `$V snapshot after-sync-dry`. Exit `0`; `data.dryRun` `true`; `m1l1` resources: skill
  `upstream-updated`, prompt `skipped-conflict`, rules `upstream-updated`, config
  `unchanged`. The two snapshots are identical.
- **Apply.** Run `$V cli sync -- sync --tool claude-code`. Same buckets with
  `data.dryRun` `false`; `totals.resources.skippedConflict` is `1`; `m1l1` reports `status`
  `updated`, so `totals.conflicts` is `0` while `totals.lessonsWithConflicts` is `1`.
  In a TTY run (`$V tty`) the summary ends with `To replace edited skills and prompts:
  10x sync --force.`
- **State.** `.claude/skills/verify-fixture-skill/SKILL.md` ends with `Fixture skill v2`;
  `CLAUDE.md` holds `Fixture rule v2`; the prompt still holds `# Fixture prompt v1` and
  `local edit`.
- **Conflicts defeat the cheap skip.** Run `$V cli sync-again -- sync --tool claude-code`.
  `m1l1` is fetched again (`fetched` `true`) and now reports `status` `conflicts`: a lesson
  with a preserved local edit is never cheap-skipped.
- **Cheap skip.** On a lesson without conflicts (e.g. a fresh run after `get` and one
  `sync`), run `$V cli sync-idle -- sync --tool claude-code`: `fetched` `false`, `status`
  `unchanged`, and `requests.log` shows no new `GET /api/lessons/…` for it.
- **All.** Run `$V cli sync-all -- sync --all --tool claude-code`. `m1l2` appears with
  `status` `updated` and its skill `created`.
- **Force.** Run `$V cli sync-force -- sync --force --tool claude-code`. The prompt's bucket is
  `upstream-updated` and the file holds `# Fixture prompt v2` again. Managed-rule
  conflicts are still preserved (not covered by the fixture).

## Gotchas

- `lessons[].status` is `updated` when anything was updated, even if another resource of
  that lesson was a `skipped-conflict`. `totals.conflicts` counts only lessons whose status
  is `conflicts`; `totals.lessonsWithConflicts` counts every lesson with a preserved local
  edit, and the `--force` hint follows it. CLI builds without `lessonsWithConflicts`
  (before #72) leave it out: fall back to `totals.resources.skippedConflict`.
- The first `sync` right after a `get` may still fetch (`fetched: true`): `get` does not
  always record the catalog digest.
- `sync` never prompts; a TTY run behaves like non-TTY for conflicts.
