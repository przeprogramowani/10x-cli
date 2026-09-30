# Get a lesson

A learner fetches a lesson pack and the CLI writes its skills, prompts, course rule block
and config templates into the project for their AI tool — previewing first if they want,
printing a single artifact instead of writing, and never silently overwriting files they
edited.

## Sub-features

- `get-apply` writes skills, prompts, the `CLAUDE.md` rule block and config templates, and
  binds the project to the course.
- `get-dry-run` reports planned writes without touching the project.
- `get-print` prints one artifact to stdout.
- `get-errors` rejects bad refs (`2`), unknown lessons (`5`) and locked modules (`4`).
- `get-conflict` asks what to do with a locally edited file (TTY) and keeps it (non-TTY).

## How to get to it (user POV)

- Run `10x get <lesson> --tool claude-code` (e.g. `10x get m1l1 --tool claude-code`).
- Add `--dry-run` to preview.
- Run `10x get <lesson> --print --type <skills|prompts|rules|configs> --name <name>`.
- Re-run `10x get <lesson>` after editing a delivered file.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`; empty project dir.

- **Preview.** Run `$V snapshot before-dry`, `$V cli dry -- get m1l1 --tool claude-code --dry-run`,
  `$V snapshot after-dry`. Exit `0`, `data.dry_run` is `true`, every `writes.*.action` is
  `created`; the two snapshots list no project files.
- **Apply.** Run `$V cli get -- get m1l1 --tool claude-code`. Exit `0`; `data.counts` is
  `{skills:1, prompts:1, rules:1, configs:1, removals:0}`.
- **Files written.** Run `$V snapshot after-get`. The project holds `.10x-cli.json`,
  `CLAUDE.md`, `.claude/.10x-cli-manifest.json`,
  `.claude/skills/verify-fixture-skill/SKILL.md`, `.claude/prompts/verify-fixture-prompt.md`,
  `.claude/config-templates/verify-fixture.json`. `CLAUDE.md` contains `Fixture rule v1`
  between `<!-- BEGIN @przeprogramowani/10x-cli -->` and `<!-- END … -->`.
- **Print.** Run `$V cli print -- get m1l1 --print --type prompts --name verify-fixture-prompt`.
  Exit `0`; `data.content` is `# Fixture prompt v1\n`; no new files in the next snapshot.
- **Errors.** `$V cli badref -- get foo` → exit `2`, `invalid_lesson_ref`.
  `$V cli missing -- get m1l9 --tool claude-code` → exit `5`, `lesson_not_found`.
  `$V cli locked -- get m2l1 --tool claude-code` → exit `4`, `module_locked`.
- **Conflict prompt.** Edit a delivered file as the learner would:
  `echo "local edit" >> <project>/.claude/prompts/verify-fixture-prompt.md` (project path from
  `$V up`), then `$V bump m1l1`, `$V tty conflict -- get m1l1 --tool claude-code`,
  `$V wait-screen 'was modified locally'`, `$V screen conflict-prompt`. The menu offers
  `Overwrite`, `Save as .user copy`, `Skip`, `Apply to all remaining`.
- **Save as .user.** Run `$V keys Down Enter`, `$V wait-screen '10x exited'`, `$V screen conflict-done`.
  The screen shows `[conflict: saved .user] prompt …`. `verify-fixture-prompt.md` now holds
  `# Fixture prompt v2`; `verify-fixture-prompt.user.md` holds the old content plus
  `local edit`.

## Gotchas

- Without `--tool` in a fresh project the CLI detects or prompts for the tool; always pass it.
- Config templates are create-only: an existing template is reported `skipped`, never adopted.
- Non-TTY conflicts resolve to skip; only the TTY path shows the menu.
- `--dry-run` writes nothing but still downloads the bundle (`requests.log` shows
  `GET /api/lessons/10xdevs3/m1l1`).
