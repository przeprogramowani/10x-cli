# CLI compatibility, channels and command context

This reference is packaged inside each helper. Both copies must have identical
bytes in the authoring repository. It defines the guided filtered-download contract;
verify the selected published CLI and live content before executing that path.

## Version and capability check

Record four independent identities: CLI runner/version, CLI package source,
public helper source revision, and the course content release. Updating one does
not automatically update the others.

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| Actual executable `--version`, command help | The runner and syntax in use | Working API, entitlement or a published helper revision |
| npm version, `dist.integrity`, `gitHead`, matching packaged README/source | Origin of that published package | Publication of changes on a development branch |
| Full helper commit retained on public CLI master | Reproducible public helper source | Installation in this project or course publication |
| Successful named download and complete local tree/manifest | Actual package/API/content behavior for this context | A successful agent task or another profile/language |

The earlier planning shorthand `get SKILL_NAME` was incorrect. Released CLI
uses a lesson reference plus `--type skills --name NAME`; there is no standalone
skill-name positional command or independent skill-owner sync contract. On 2026-09-14, CLI `1.21.0` was published with v4, filtered skill downloads
and Circle login; production m1 EN/PL and sync were verified. Its npm `gitHead`
is `2cc510fe690ba820937602d702564985087ded46`. These revised helpers have their
own source/content identity and are not implied by installing CLI 1.21.0. A local
source build can carry an old version label; do not identify features from that
label alone.

For a known installed version, read its npm metadata (replace the shell variable
with the observed version) and use the matching source revision for documentation:

```bash
: "${CLI_VERSION:?Set the actual published CLI version}"
npm view "@przeprogramowani/10x-cli@$CLI_VERSION" version engines gitHead dist.integrity dist.tarball --json
```

Use that exact package's README or
`https://raw.githubusercontent.com/przeprogramowani/10x-cli/<gitHead>/README.md`,
with the real `gitHead` substituted. For a standalone binary, use its actual
release tag/asset, published verification information and matching source. Do not
invent a source SHA if metadata is absent. The installed help wins for supported
flags; a help/README mismatch must remain visible and be checked against matching
source, not resolved by fetching arbitrary master instructions.

Before the filtered-download journey, verify `get --help` and matching source/release evidence
for `get m1l1 --type skills --name NAME` and lesson-scoped sync. A successful `--help` exit alone does
not prove skill-filter support. If support or release evidence is missing, prepare the
public helpers and handoff, but pause filtered commands with a precise explanation.
Once supported, a filtered dry-run verifies the actual API/content selection before
writing. Report unsupported reference, missing skill/index, locked module, denied
access and network errors separately; do not silently use a lesson or v3 instead.

## Keep one runner and one project context

The examples below use a pinned npx runner in macOS/zsh or another POSIX shell.
Set `CLI_VERSION` from verified release evidence, then use this function in that
shell session. If the user's existing verified global/standalone `10x` works,
substitute its exact executable for `10x_cli`; no reinstall is required.

```bash
: "${CLI_VERSION:?Set the actual published CLI version}"
10x_cli() { npx --yes "@przeprogramowani/10x-cli@$CLI_VERSION" "$@"; }
10x_cli --version
10x_cli --help
10x_cli get --help
10x_cli sync --help
10x_cli auth --help
10x_cli auth --status
10x_cli list --course 10xdevs4
```

Run commands from the intended project root. The target guided context is
`--course 10xdevs4 --tool claude-code --lang pl`; preserve it in downloads,
previews, updates and recovery. `list` takes `--course`, not tool/lang flags.
Use another context only when the user chose it. Record any language fallback
reported by the CLI rather than calling English output Polish.

The project edition is stored in `.10x-cli.json` after a validated write and shared
across profiles; existing supported manifests also carry edition information.
Course selection is explicit flag → project edition → live API recommendation.
An explicit course does not authorize changing a bound project's edition. Retain
the v3 project and start a separate v4 directory for this journey. Preserve unknown,
corrupt or conflicting manifests; never delete a binding to force migration.

Verified releases with the project-binding safeguards preserve project files and
tool/language preferences during `list`, `get --print`, `get --dry-run`,
`sync --dry-run` and `doctor`. Auth token refresh can still update the credential
store. Verify the selected release's contract before describing a preview as
read-only; do not generalize older source bugs to the target release.

## Two helper channels, one owner per installed copy

The public authoring source is `przeprogramowani/10x-cli`, under
`skills/10x-cli-setup/` and `skills/10x-cli-guide/`. Toolkit distributes controlled
copies through course content. Each helper includes `SKILL.md` and its own
`references/compatibility.md`; neither may rely on an installed sibling helper.

Before either installer writes, inspect the destination directory, its path
components/symlink targets, the tool's `.10x-cli-manifest.json`, and the skills
installer's project registration/lock. Do not infer ownership solely from a
directory name. If ownership is mixed or unknown, preserve local files and
resolve it before writing; use a separate project to try the other channel.

### Public on-demand channel

This channel can bootstrap before CLI installation or course authentication.
Select a full, retained public CLI master commit containing these helper trees;
record it as `CLI_SKILLS_REF`. Do not use an unmerged branch SHA as the permanent
reference. The installer is separately pinned to the inspected `skills@1.5.26`.

```bash
: "${CLI_SKILLS_REF:?Set the full public CLI master SHA containing the helpers}"
npx --yes skills@1.5.26 add "https://github.com/przeprogramowani/10x-cli/tree/$CLI_SKILLS_REF/skills" --skill 10x-cli-setup --agent claude-code --copy
npx --yes skills@1.5.26 add "https://github.com/przeprogramowani/10x-cli/tree/$CLI_SKILLS_REF/skills" --skill 10x-cli-guide --agent claude-code --copy
```

Run only the needed helper's command, from the project root. Project scope is the
default; do not add `--global`/`-g`. `--copy` requests a project copy instead of a
symlink. `npx --yes` accepts running the pinned npm tool; there is deliberately no
`--yes` argument to `skills add`, so its own prompts are retained. Confirm the
installer's actual paths and complete references after installation. A helper
already managed by CLI should be used/updated through CLI, not overwritten here.

### CLI channel

Use this channel after setup/auth and only with verified skill-filter support and
available v4 content. These helpers and the launch chain `10x-init`, `10x-shape`, `10x-prd` belong to m1l1
and inherit course membership and module availability. Their source membership
does not prove that the content has been published or unlocked.

In a separate project from the public copies, or after the explicit takeover
below, use the same verified `10x_cli` runner:

```bash
10x_cli get m1l1 --type skills --name 10x-cli-setup --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-cli-setup --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-cli-guide --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-cli-guide --course 10xdevs4 --tool claude-code --lang pl
```

Each successful filtered skill download should materialize
`.claude/skills/<canonical-name>/SKILL.md` and
`.claude/skills/<canonical-name>/references/compatibility.md`, under lesson ownership
`lessons.m1l1.skills` in `.claude/.10x-cli-manifest.json`, with hashes in
`files.skills`. Confirm that complete tree and owner from actual output/files.
This filter writes only the selected skill, not course rules or the whole lesson.

### Changing the owner deliberately

To move a public copy to CLI, inventory and back up that entire helper outside the
managed skill trees, including local changes and installer metadata needed for
recovery. Use the original pinned installer's `remove --help` and `remove` flow to
unregister only the selected helper at project scope for the selected agent.
Verify that both its registration and destination path/symlink are gone. If
anything remains or another owner is present, stop the takeover and preserve it.
Then use a filtered skill download and inspect its complete tree and lesson ownership. Merge
desired local edits consciously from the backup; do not automatically force them
over the downloaded copy. Reopen/read the installed helper after replacement.

The reverse move has no verified CLI per-skill unregister command in this contract.
Use a new isolated project for a public copy; do not hand-edit the CLI manifest or
place two updaters over the same files. Normal use does not require any takeover.

## Download, use, update

The launch example is lesson 1's existing 10xCards: init → shape → PRD.
`10x-plan` is not available for the launch demonstration. After capability and
content checks for each name, inspect each preview before its corresponding write:

```bash
10x_cli get m1l1 --type skills --name 10x-init --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-init --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-shape --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-shape --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-prd --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-prd --course 10xdevs4 --tool claude-code --lang pl
```

Require the complete three trees and inspect each installed entrypoint/reference.
All checks below must succeed before use; stop on any failure:

```bash
test -s .claude/skills/10x-init/SKILL.md
test -s .claude/skills/10x-shape/SKILL.md
test -s .claude/skills/10x-shape/references/prd-schema.md
test -s .claude/skills/10x-prd/SKILL.md
test -s .claude/skills/10x-prd/../10x-shape/references/prd-schema.md
```

PRD reads `../10x-shape/references/prd-schema.md` relative to its SKILL.md;
isolated PRD download is insufficient. These are the source minimum: preserve
additional supporting files in the selected release. Inspect all three names in
`lessons.m1l1.skills`, their hashes in `files.skills`, and the project edition
binding. Partial downloads do not establish complete lesson freshness/release identity.
Membership in source is candidate evidence; actual filtered availability, full PL
references and release identity still need verification for all three names.

`CLAUDE-m1l1` is a separate lesson rule and is not included in these filtered gets.
The inspected three skill sources do not require it for the chain. This is not
proof that the entire lesson needs no rule: if the learner's lesson instructions
require it, inspect an existing rule's provenance, or report the missing
prerequisite and ask the lesson/release owner for a supported route before that
step. Never invent a command, overwrite a rule or fall back to full lesson get.

Have the agent explicitly read each installed SKILL.md and its references in
order: init preserves/scaffolds context directories; shape conducts the actual
10xCards discovery with the learner and writes
`context/foundation/shape-notes.md`; after the learner approves those notes, PRD
uses them and the sibling schema to produce `context/foundation/prd.md`.
Ask for missing lesson inputs; do not manufacture a task.md, product decisions or
a finished plan. Respect existing-file collision choices and report actual output
paths. Inspect the notes, schema compliance, open questions and preserved local
work. Stop at PRD, without stack selection or implementation. Download alone is
not use; native slash/$ discovery needs separate agent evidence. Keep private
lesson text out of public fixtures. The guide supplies the detailed agent steps.

Sync below refreshes entire recorded lessons, not only the three skill filters.
Preview may include other skills, prompts, configs and course rules; apply only
when the user accepts that scope. For a narrow update, repeat the selected skill
filter instead. Never use sync to silently bypass a missing lesson-rule prerequisite.

```bash
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl
```

Normal sync refreshes downloaded owners, including the full lessons that own previously downloaded skills. Avoid `--all` for this small journey. Inspect updated,
unchanged, conflict/preserved and error outcomes even when exit is 0. Preserve
local edits; do not use automatic `--force`. Recovery commands must retain the
same runner/course/tool/lang, even if an older report omits that context.

Filtered lesson get (`m1l1 --type skills --name ...`) is the supported command
used throughout this guide. It preserves other previously downloaded artifacts
through partial writes; normal sync later operates at lesson scope. `--print` is an
inspection surface, not installation: human TTY output can show only SKILL.md,
while non-TTY output is JSON. Never redirect it into SKILL.md as a full package.

| Item to update | Correct channel |
|---|---|
| npx CLI | Choose and verify a new published version, update the runner pin |
| Global npm CLI | `npm install -g "@przeprogramowani/10x-cli@$CLI_VERSION"` after selecting/verifying the version |
| Standalone CLI | Replace through its verified release asset procedure, then check the actual executable |
| Public helper copy | Inspect local changes/ownership; rerun its selected `skills add` command with a deliberate new full source SHA |
| CLI-owned helper or exercise skill | Repeat its filtered get for a narrow update; `sync` refreshes full recorded lessons after preview |

`skills update` is not a substitute for proving an exact selected helper revision;
it may follow a different ref/latest. npm install includes helper source files in
the package but does not install them into an agent. CLI sync cannot update the
CLI executable or a public installer-owned helper.

## Diagnostics and evidence boundaries

Doctor performs auth/access, API, config, version and configured-tool checks.
It can return 78 with an outer JSON `status: "ok"`; inspect `data.overall` and all
`data.checks`. A missing tool directory before first get can be expected. Explain
only that failure as pre-download state; do not ignore auth/network/permissions.
The inspected doctor has no `--tool` or `--course` flags and may report a different
configured profile/course from this journey's explicit command context.

Configuration is under `$XDG_CONFIG_HOME/10x-cli` on macOS/Linux when nonempty,
otherwise `~/.config/10x-cli`. Windows uses `%APPDATA%/10x-cli`, falling back to
the user's `AppData/Roaming/10x-cli`. Inspect only needed nonsecret preferences;
do not dump credentials or reset the entire config directory. Auth validity and
live course access are distinct: inspect `access_checked`/access errors, not only
the status exit. Login is user-operated and may send email.

Full acceptance needs real package/version/integrity/source and endpoint/content
release evidence, both helper channels, complete support files, and an actual
agent task transcript for macOS/zsh/Claude Code/PL. Local builds and fixtures can
check structure/conflicts but cannot prove publication, course unlock or this
user's entitlement. Other platforms/profiles and EN/PL transformed content need
their own evidence; do not imply a Windows or translated-content walkthrough ran.
