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

## Session management

When login is needed, let the user choose the delivery channel and complete it:

```bash
10x_cli auth                  # Interactive: choose email or Circle
10x_cli auth --method email   # Email magic link; default for piped/JSON output
10x_cli auth --method circle  # One-time approval link delivered in Circle
10x_cli auth --status
10x_cli auth --logout
```

Circle is useful when the email does not arrive. The approval link expires after
15 minutes; the CLI does not resend it automatically. In non-interactive mode,
provide the user's email with `--email` and choose `--method circle` explicitly.
Do not send a login message until the user requests authentication. Sessions
refresh transparently; re-login is needed only when refresh cannot recover them.

## Download

The launch exercise follows lesson 1, “Od pomysłu do PRD”, using its existing
10xCards example. `10x-plan` is not part of this launch demonstration.
After checking each name's capability and availability, download three separate
full named skill trees. Inspect each dry-run before its corresponding write:

```bash
10x_cli get 10x-init --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get 10x-init --course 10xdevs4 --tool claude-code --lang pl
10x_cli get 10x-shape --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get 10x-shape --course 10xdevs4 --tool claude-code --lang pl
10x_cli get 10x-prd --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get 10x-prd --course 10xdevs4 --tool claude-code --lang pl
```

Inspect each report and the complete supporting tree, not just SKILL.md. In the
chosen macOS/zsh exercise directory, each of these checks must succeed before use
(stop on any failure; do not infer success from the last check alone):

```bash
test -s .claude/skills/10x-init/SKILL.md
test -s .claude/skills/10x-shape/SKILL.md
test -s .claude/skills/10x-shape/references/prd-schema.md
test -s .claude/skills/10x-prd/SKILL.md
test -s .claude/skills/10x-prd/../10x-shape/references/prd-schema.md
```

The PRD entrypoint resolves `../10x-shape/references/prd-schema.md` relative to its
own directory. A standalone PRD tree is insufficient. Read all installed
entrypoints and every reference they require; the paths above are the known
source minimum, not permission to discard extra files from a published bundle.
Also inspect `.claude/.10x-cli-manifest.json` for all three canonical direct owners
and `.10x-cli.json` for the project edition, course and release context.

CLI 1.21.0 is published with v4 and named downloads; production m1l1 EN/PL
contains init/shape/prd and their references. These revised helpers are a separate
source change, not proof that their course copies have been published.
Verify all three names against the actual selected release. If any name, schema,
owner or release is missing/mismatched, preserve the precise error and stop the
exercise; never silently substitute a whole lesson, another course or filtered get.

`CLAUDE-m1l1` is a separate lesson rule, not delivered by these named skill gets.
The inspected init/shape/prd sources do not require that rule to run this chain.
This does not establish that every step of the full lesson works without it.
Use the learner's existing lesson 1 inputs and instructions: if they require the
rule, inspect the existing project rule and its provenance. If absent, report the
missing prerequisite and obtain the supported route from the lesson/release owner
before that step. Do not invent a rule command or download a full lesson to bypass
it. Do not overwrite an existing project rule.

For browsing use `10x_cli list m1 --course 10xdevs4`. Filtered lesson get is a
separate operation, not equivalent direct-owner sync. `--print` is inspection:
TTY Markdown can contain only SKILL.md; non-TTY output is a JSON envelope. Never
redirect print output into SKILL.md as a package installation.

## Use: 10xCards, from idea to PRD

Downloading the trees is only preparation. Use the existing 10xCards example and
the learner's actual answers from lesson 1. If those inputs are absent, ask for
them; do not invent product requirements, a replacement task.md or a ready-made
plan. Keep private lesson text out of public fixtures and transcripts.
Do not assume native slash/$ discovery or automatic activation from npm install.
Give the agent explicit local paths and work through these steps separately:

1. Read `.claude/skills/10x-init/SKILL.md` and follow it in the chosen project.
   Inspect the create-if-absent context/changes, context/archive and
   context/foundation directories and their READMEs. Preserve existing files.
2. Read `.claude/skills/10x-shape/SKILL.md` and
   `.claude/skills/10x-shape/references/prd-schema.md`. Follow the skill's discovery
   with the learner's 10xCards inputs. Let the learner answer and approve the
   checkpoint; do not answer for them. Inspect
   `context/foundation/shape-notes.md` against those answers before proceeding.
3. Read `.claude/skills/10x-prd/SKILL.md` and its sibling schema, then generate the
   draft from the actual `context/foundation/shape-notes.md`. Inspect
   `context/foundation/prd.md` against that input and the installed schema;
   unresolved domain choices stay open. Respect the skill's existing-file
   collision choice (a versioned file may be the appropriate result).

Success requires the learner's notes and a schema-conformant PRD, with gaps
explicit and original project work preserved. A transcript of downloads alone
is insufficient. Stop after reviewing the PRD; do not chain into stack selection,
bootstrap or implementation. If a different global/local skill copy was read,
correct the path before accepting the result. Record the actual agent, profile,
language, output paths and checks; use a fresh isolated exercise directory for the
two canonical output filenames instead of forcing an overwrite.

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
| No email received | Offer `10x_cli auth --method circle`; let the user request the message. |
| `circle_login_disabled` | Circle is unavailable; use `10x_cli auth --method email`. |
| `dm_rejected` | Enable Circle direct messages or use email login. |
| `circle_login_expired` | Ask for a fresh Circle login or use email; never auto-resend. |
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
