# Skill glossary

A learner runs `10x skill <name>` and reads a short terminal entry for one course skill:
place in the workflow, problem, solution, when to use it, what it produces and related
skills, in English or Polish. It reads nothing but the project's course and writes nothing.

## Sub-features

- `skill-found` — a known name, in JSON and in a TTY.
- `skill-aliases` — `/name` and a name without the `10x-` prefix resolve to the same entry.
- `skill-lang` — `--lang pl` returns Polish text and labels.
- `skill-missing` — an unknown name exits `5` and suggests close names.
- `skill-usage` — an invalid name or `--lang` exits `2`.
- `skill-unsupported` — a backend without the route exits `1`.

## Driving it with verify.sh

Preconditions: baseline run with `$V seed-auth`. The fake serves one overview,
`verify-fixture-skill`.

- **Found.** `$V cli found -- skill verify-fixture-skill`: exit `0`,
  `data.overview.name` `verify-fixture-skill`, `data.overview.language` `en`.
  `$V tty found-tty -- skill verify-fixture-skill` shows `Problem`, `Solution`, `Use when`,
  `Produces` and `Related`.
- **Aliases.** `$V cli slash -- skill /verify-fixture-skill` returns the same entry.
- **Language.** `$V cli pl -- skill verify-fixture-skill --lang pl`:
  `data.overview.language` `pl`. In a TTY the labels read `Rozwiązanie`, `Kiedy`, `Tworzy`.
- **Missing.** `$V cli missing -- skill verify-fixture-skil`: exit `5`, `error.code`
  `skill_overview_not_found`, `error.hint` names `verify-fixture-skill`.
- **Usage.** `$V cli bad-name -- skill ../etc` exits `2` with `invalid_skill_name`;
  `$V cli bad-lang -- skill verify-fixture-skill --lang de` exits `2` with `invalid_lang`.
- **Older backend.** `curl -X POST "$api/__fake/skill-overviews/route?enabled=0"`, then
  `$V cli off -- skill verify-fixture-skill`: exit `1`, `error.code`
  `skill_overviews_unsupported`.
