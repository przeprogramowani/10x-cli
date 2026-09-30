# Browse lessons

A learner sees the course's modules with their lock state and release date, then the
lessons inside one module, so they know which `m<module>l<lesson>` to fetch.

## Sub-features

- `list-modules` lists every module with state and lesson count.
- `list-module` lists the lessons of one module.
- `list-locked` shows a locked module with no lessons.
- `list-usage` rejects unknown options with exit `2`.

## How to get to it (user POV)

- Run `10x list`.
- Run `10x list <module>` (e.g. `10x list 1` or `10x list m1`).
- Run `10x list --course <id or slug>` to pick a course explicitly.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`.

- **Modules.** Run `$V cli list -- list`. Exit `0`; `data.course` is `10xdevs3`;
  `data.modules` has module `1` `unlocked` with `lessonCount` `2` and module `2` `locked`.
- **Lessons in a module.** Run `$V cli list-m1 -- list 1`. Exit `0`; `data.lessons` holds
  `m1l1` and `m1l2` with titles `Verify fixture: first lesson` / `second lesson`.
- **Locked module.** Run `$V cli list-m2 -- list 2`. Exit `0`; `data.state` is `locked`,
  `data.lessons` is `[]`.
- **Human output.** Run `$V tty list-human -- list`, `$V wait-screen '10x exited'`,
  `$V screen list-human`. The screen names both modules and their states.
- **Bad option.** Run `$V cli badopt -- list --nope`. Exit `2`, stderr starts with
  `ERROR usage: Unknown option`.

## Gotchas

- `data.selectionReason` is `backend_recommendation` before any `get` and
  `project_binding` after one (the project gets a `.10x-cli.json`).
- `list` reads through the catalog/modules endpoints only; it never writes the project.
