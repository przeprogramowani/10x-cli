# Install skills without a lesson

A learner installs one course skill (`10x skill <name> --install`) or a named group
(`10x skill-group <name> --install`, e.g. the Core Skill Chain) without knowing which lesson
delivers it, and reads a group's members with `10x skill-group <name>`. Installs write the
skills for the chosen tool, keep local edits, step aside for skills a downloaded lesson
already owns, follow a group that shrinks upstream, and never bind the project to a course.

## Sub-features

- `install-skill` writes one skill (`10x-plan`, two files) and reports its course and source lesson.
- `install-group` writes every member of `core-skill-chain`; the group overview lists them in order.
- `install-unchanged` re-running either install reports `unchanged`.
- `install-conflict` a locally edited file is `conflict_skipped` (non-TTY) or prompts (TTY).
- `install-managed` a skill a lesson owns is `managed_by_lesson` with that lesson and is not written.
- `install-shrink` a member dropped upstream is removed, or kept when edited.
- `install-no-binding` no `.10x-cli.json` is created; the manifest gets `skill:` / `group:` entries.
- `install-errors` unknown names exit `5`, a denied course `4`, usage `2`, an older backend `1`.
- `install-older-cli` the previous published CLI keeps working on the same project.

## How to get to it (user POV)

- Run `10x skill 10x-plan --install --tool claude-code` (add `--dry-run` to preview).
- Run `10x skill-group core-skill-chain`, then `10x skill-group core-skill-chain --install --tool claude-code`.
- Re-run either after editing an installed file, after `10x get <lesson>`, or after an upstream change.

## Driving it with verify.sh

Preconditions:

- Baseline run with `$V seed-auth`; empty project dir. Repeat the recipe in a second run
  with `--tool codex` (files under `.agents/`, manifest `.agents/.10x-cli-manifest.json`).
- The fake serves the three routes from lesson `m1l2`, which delivers the six chain skills
  plus `verify-m1l2-skill`. No module-lock check applies to them.

- **Preview.** `$V snapshot before-dry`, `$V cli dry -- skill 10x-plan --install --tool claude-code --dry-run`,
  `$V snapshot after-dry`. Exit `0`; `data.result.dry_run` `true`; both `10x-plan` files
  `created`; neither snapshot lists project files.
- **One skill.** `$V cli plan -- skill 10x-plan --install --tool claude-code`. Exit `0`;
  `data.skill` `10x-plan`, `data.course` `10xdevs3`, `data.grantedBy`
  `{kind:"course",id:"10xdevs-3"}`, `data.sourceLessonId` `m1l2`; `SKILL.md` and
  `references/plan-template.md` `created`.
- **Group.** `$V cli group-doc -- skill-group core-skill-chain`: `data.group.skills` lists
  the six members in order. `$V cli group -- skill-group core-skill-chain --install --tool claude-code`:
  five members `created`, `10x-plan` `unchanged`.
- **No binding.** `$V snapshot after-group`: the project has `.claude/.10x-cli-manifest.json`
  and six skill dirs, but no `.10x-cli.json` and no `CLAUDE.md`. The manifest `lessons` has
  `skill:10x-plan` and `group:core-skill-chain`, each with `representation`
  `{courseRules:false, rules:false}`.
- **Unchanged.** Re-run both installs: every file `unchanged`. Human output (TTY) is one
  line per skill: `[unchanged] 10x-plan (2 files)`.
- **Conflict.** `echo "local edit" >> <project>/.claude/skills/10x-research/SKILL.md`, re-run
  the group install: `10x-research` `conflict_skipped`, the rest `unchanged`, exit `0`.
  After `$V bump m1l2` the rest become `updated` and the edit is still there. In a TTY the
  conflict menu (`… was modified locally`) offers Overwrite / Save as .user copy / Skip.
- **Managed by lesson.** `$V cli get-m1l2 -- get m1l2 --tool claude-code` (it binds the
  project: `.10x-cli.json` appears now), then re-run the group install: every member that
  `m1l2` owns is `managed_by_lesson` with `ownerLessonId` `m1l2`, and their bytes do not change.
  A member whose lesson write was conflict-skipped stays `conflict_skipped`. TTY:
  `[managed by lesson m1l2] skill 10x-plan — update with '10x get m1l2' or '10x sync'`.
- **Shrink.** Before any lesson owns the chain (a fresh run), edit `10x-frame`, then
  `curl -X POST "$api/__fake/skill-groups/drop?skill=10x-impl-review"` and
  `curl -X POST "$api/__fake/skill-groups/drop?skill=10x-frame"`, and re-run the group install.
  `data.result.removals`: `10x-impl-review/SKILL.md` `removed`, `10x-frame/SKILL.md`
  `preserved_local` (`locally_modified`). The `10x-frame` dir and its edit remain.
- **Errors.** `skill 10x-pla --install …` exit `5` `skill_not_found`;
  `skill-group core-skil-chain --install …` exit `5` `skill_group_not_found`, hint
  `Did you mean: core-skill-chain?`; `skill 10x-plan --install … --course 10xdevs4` exit `4`
  `course_access_denied`; `--course nope` exit `2` `course_not_found`;
  `skill 10x-plan --dry-run` and `skill-group core-skill-chain --tool codex` exit `2`
  `install_required`.
- **Older backend.** `curl -X POST "$api/__fake/skills/route?enabled=0"`: both installs exit
  `1` `skill_install_unsupported`, the group overview `skill_groups_unsupported`.
  Re-enable with `enabled=1`.
- **Previous CLI.** In the same project, run the last published CLI with the run's env
  (`API_BASE_URL`, `BUNDLE_PUBLIC_KEYSET`, `XDG_CONFIG_HOME` from `run.env`), e.g.
  `npm install --prefix <scratch> @przeprogramowani/10x-cli@<version>` then
  `node <scratch>/node_modules/@przeprogramowani/10x-cli/dist/index.mjs`. `doctor` exits `0`.
  `sync --dry-run --tool <tool>` exits `0` and lists only lesson IDs (none on a
  standalone-only project). `get m1l1 --tool <tool>` exits `0`. Snapshots before and after
  show the standalone files unchanged, and the manifest still has both reserved entries.

## Gotchas

- Always pass `--tool`; without it a fresh project detects or prompts.
- Typo suggestions for `10x skill` come from the overviews route, which serves only
  `verify-fixture-skill`, so `10x-pla` gets no name suggestion (in a bound project the
  hint suggests `--course` instead).
- `--lang pl` returns English with `X-Content-Fallback: true` (the fixture is English only);
  `data.result.language` is `en`.
- An older CLI's lesson write that touches the rules block (`get m1l1`) deletes the
  reserved entries' `representation`; the next install records it again. This CLI's
  `otherRulesOwners` ignores standalone keys either way, so they never count as rules owners.
- `$V tty` needs `tmux`. Without it, run the command under `script -q <file>` (human output)
  or `expect` (conflict menu) with the same env as `$V cli`, and record that substitution.
