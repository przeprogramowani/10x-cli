---
name: 10x-cli-guide
description: "Use when the user wants to download, use or update 10xDevs CLI skills, choose a helper installation channel, inspect course content, switch tool profiles or troubleshoot CLI/auth/content conflicts. Guides named get → an actual agent task → sync while preserving local work and course/tool/language context. For first installation or authentication preparation, use an available 10x-cli-setup copy. Does not implement CLI runtime or grant course access."
---

# 10x-cli: download, use, update

Read the bundled [compatibility and channel reference](references/compatibility.md)
before issuing commands. It contains the pinned runner setup, version checks, both
helper channels and ownership safeguards. Instructions describe the intended named
contract; verify the actual selected package and content before using it. A local
build or source membership is not proof that a feature has shipped.

## Environment

Reuse the setup handoff: project root, course, tool, language, runner/version,
auth/access status, update method and helper channel/path. If anything is absent,
inspect only that item. A working installed CLI needs no reinstall. If setup is
needed, locate its actual SKILL.md and references or install that helper through
the public channel; do not invoke a missing sibling by name.

The guided acceptance context is macOS/zsh, Claude Code, 10xdevs4 and Polish.
Determine the actual OS and shell from the environment, not a POSIX command that
labels every failure Windows. Select the intended project root before any write.
For v4, retain an existing v3 project and use a separate directory; ordinary get,
sync and profile changes do not migrate editions. Preserve `.10x-cli.json` and
all manifests if their versions/courses conflict.

Use the verified `10x_cli` runner defined in the reference, or the user's exact
verified global/standalone executable:

```bash
10x_cli --version
10x_cli get --help
10x_cli sync --help
10x_cli auth --status
10x_cli list --course 10xdevs4
```

Check source/release evidence for named input and direct-owner sync, then use the
named preview below to check the endpoint. Do not treat a successful help exit as
capability proof. Keep unsupported CLI syntax, unpublished/missing content, locked
module, membership denial and network failure distinct. Missing final release
evidence need not block preparing the public helpers or the exercise files.

Read only needed nonsecret preferences from `config.json`. On macOS/Linux its
base is nonempty `$XDG_CONFIG_HOME`, otherwise `~/.config`; on Windows it is
`%APPDATA%`, otherwise the user's `AppData/Roaming`. Append `10x-cli/config.json`.
Do not print `auth.json`, discard stderr, truncate doctor JSON or erase config to
repair an unknown problem. An explicit course/tool/language in this journey takes
precedence over saved defaults for that command.

## Download

After capability and availability checks, get the full named planning skill:

```bash
10x_cli get 10x-plan --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get 10x-plan --course 10xdevs4 --tool claude-code --lang pl
```

Inspect the preview before writing, then inspect the resulting report and files:

- `.claude/skills/10x-plan/SKILL.md` and its complete supporting tree, including
  `.claude/skills/10x-plan/references/progress-format.md`.
- `.claude/.10x-cli-manifest.json` with the canonical named skill's direct owner.
- Project edition `.10x-cli.json` and actual course/language/release information.

A full named download does not require the rest of m1l1 or its rules. These skills
are introduced in v4 m1l1 and inherit its membership/module gate after content
publication. If a name is unavailable, preserve the precise error; never silently
substitute a whole lesson, another course or a filtered download.

For browsing use `10x_cli list m1 --course 10xdevs4`. A full lesson remains a
separate choice: `10x_cli get m1l1 --course 10xdevs4 --tool claude-code --lang pl`
can install several skills, prompts, rules and config templates. A filtered lesson
get with `--type skills --name 10x-plan` is not the full named direct-owner
contract; do not promise it establishes equivalent sync tracking. `--print` is
inspection: TTY Markdown can contain only SKILL.md; piped/non-TTY output is a JSON
envelope. Never redirect print output into SKILL.md as a package installation.

## Use: create a small plan

Downloading a skill is the start. Have the agent read the installed entrypoint and
its own references, then do a concrete task. Do not assume native slash/$
discovery or automatic activation from npm installation.

The exercise project contains `index.html`, a static reading list with three
sample titles, and `task.md` with this request:

> Plan a case-insensitive title filter, empty-result message and reset. Preserve
> the existing data. Use no dependencies or server and do not implement the
> filter. Write the plan to context/changes/reading-list-filter/plan.md. Product
> choices in this task are settled; record missing information explicitly.

If these inputs are absent, prepare this small fixture in the user's chosen empty
exercise directory; preserve any existing project and files. Tell the agent:

> Read .claude/skills/10x-plan/SKILL.md and its bundled references, then follow
> task.md. This is planning only; do not implement the filter.

Inspect the result, not just the command transcript. Success means a concrete plan
covering all three behaviors and verification, unchecked Progress, unchanged
`index.html` data and no implemented filter. The skill may also create a brief and
change identity; do not restrict it to a lone plan file against its own contract.
If the agent read a different global/local copy, correct the path and repeat the
read before accepting the result. Record the actual agent/profile/language used.

## Update

Use the same runner, directory, course, tool and language:

```bash
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl
```

Normal sync refreshes already downloaded owners, including direct named owners in
compatible releases. `--all` broadens scope to unlocked lessons and is not needed
for this exercise. Missing managed files should be repaired; local edits should
remain visible as conflicts or preserved files. Read all report outcomes and
resource counts even if exit is 0: skipped conflicts alone are not process errors.
Do not equate an unchanged remote digest with intact local files.

For one conflicting skill, inspect the diff and back up local work before retrying
its named get in an interactive terminal with the same course/tool/lang. Preserve
the user's resolution choice. If a CLI hint omits context, restore these flags in
your proposed command. Never run automatic `--force`; it can overwrite local
skill/prompt edits and does not bypass protected rules or safe removal. Config
templates remain create-only. Cleanup preserves modified/untracked files and
files owned elsewhere; do not manually sweep a skill directory after sync.

Three updates are independent: changing the npm/binary version updates the CLI;
repeating pinned public `skills add` with a deliberately chosen new retained SHA
updates a public helper; CLI sync updates CLI-owned course skills. It does not
update the executable or public installer-owned helper copies.

## Channels: both helpers are available through two routes

The public on-demand route works before CLI/auth and installs one project helper
at a selected source SHA. The CLI route uses authenticated named get once helper
content is published and m1l1 is accessible. Follow the exact commands and guards
in the reference for `10x-cli-setup` and `10x-cli-guide`; install only what is needed.
Both routes deliver each helper's own `references/compatibility.md`.

Use one owner per installed copy. Inspect destination paths/symlinks, CLI manifest
and the public installer's project registration before writing. If a helper is
already CLI-owned, use that copy and sync. For a public→CLI takeover, back up the
whole helper and metadata outside managed trees, unregister only that helper using
the original pinned installer's project/agent remove flow, verify registration and
destination are absent, then named get. Merge local edits consciously from backup.
If either owner remains, stop the takeover. CLI→public has no verified per-skill
unregister contract: use a new isolated project instead of hand-editing manifests.

## Profiles and troubleshooting

Full skill trees land under the selected profile's `skills/<canonical-name>/`:

| Profile | Tool directory | Rules file for full lesson delivery |
|---|---|---|
| claude-code | `.claude/` | `CLAUDE.md` |
| cursor | `.cursor/` | `.cursor/rules/10x-course.mdc` |
| copilot | `.github/` | `.github/copilot-instructions.md` |
| codex | `.agents/` | `AGENTS.md` |
| devin-desktop | `.devin/` | `AGENTS.md` |
| gemini | `.gemini/` | `GEMINI.md` |
| generic | `.ai/` | `AGENTS.md` |

Profile changes may offer migrate, delete eligible managed files, or keep both;
none means deleting arbitrary user content or switching the course edition.
Legacy windsurf aliases and orphan handling should follow the selected version's
help/output. These path mappings are not evidence of a completed Windows or
other-agent walkthrough. Translate shell syntax to the user's actual shell.

Run `10x_cli doctor --json` when diagnosis is useful; inspect its complete
`data.overall` and `data.checks` as well as exit status. It checks the configured
profile, not a `--tool` or `--course` argument. Before first get, a missing tool
directory can be expected; explain only that failure and keep other failures
visible. Doctor exit 78 can coexist with outer JSON `status: "ok"`.

| Symptom | Next step |
|---|---|
| Missing/expired auth | Inspect auth status and live-access result; let the user complete login through setup. Login may send email. |
| Denied course access | Confirm selected course and membership; changing tool/reinstalling does not grant access. |
| Locked or unpublished v4 | Inspect module availability/release evidence; do not bypass the gate or fall back to v3. |
| Unsupported name/missing index | Verify exact CLI package and content release; preserve the error for the release owner. |
| Network/API failure | Keep diagnostics, retry the same context when service returns; no config reset. |
| Wrong directory/profile | Recheck cwd and explicit flags; a fresh project may legitimately have no tool directory. |
| Signature/release mismatch | Preserve failure and source identity; do not disable verification or reuse unrelated bytes. |
| Edition/manifest conflict | Preserve binding and manifests for repair; use a separate v4 project rather than deleting them. |
| File conflict or permission failure | Inspect affected paths and local edits, retain backup and resolve the specific issue. No broad chmod/reset/force. |

Use `--verbose` only when needed, and redact credentials before sharing diagnostics.
For unrelated day-to-day commands such as `bench`, inspect this runner's matching
help; do not fetch arbitrary master README as an authority for an older binary.
