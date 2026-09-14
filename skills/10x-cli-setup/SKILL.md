---
name: 10x-cli-setup
description: "Set up or troubleshoot @przeprogramowani/10x-cli for a 10xDevs learner: reuse or install a compatible CLI, check authentication and course access, choose the project and AI tool, and hand off to 10x-cli-guide. Use for installation, updates, npm permissions and onboarding. Excludes CLI source development and everyday download/use/sync guidance once setup is ready."
---

# 10x-cli Setup

Prepare the user's CLI and project, then pass the working context to guide. Read
[the compatibility reference](references/compatibility.md) before choosing a
version, installing a helper, or running a course command. Use the actual runner's
help and its matching published source; a moving master README does not establish
what the installed CLI supports.

## 1. Establish the project and existing installation

Use the user's request and existing session context. Identify the intended project
directory, shell and AI tool before writing files. For the guided 10xDevs4 exercise
the context is macOS/zsh, `10xdevs4`, `claude-code`, `pl`; do not silently apply it
to a v3 project or a user who selected another profile.

In a POSIX shell, inspect the runner without hiding failures:

```bash
pwd
command -v 10x
```

If found, run `10x --version` and its `--help`, `get --help`, `sync --help` and
`auth --help`. Record the executable path and installation method. An existing
working installation needs no reinstall or fresh login. If an executable exists
but fails, preserve the error and diagnose its runtime/PATH/permissions; this is
different from a missing command. On other systems use their shell's executable
lookup, not a POSIX detection snippet.

Inspect the project's `.10x-cli.json` and existing profile manifests as local
metadata, without editing them. The course binding is shared across profiles;
changing `--tool` cannot switch v3 to v4. For a v4 exercise with a bound v3 project,
use a separate directory and retain the v3 project. Preserve corrupt, unknown or
conflicting bindings/manifests for diagnosis; do not delete them to force access.

## 2. Select a compatible runner, then install only if needed

Follow **Version and capability check** in the local reference. Record the actual
package version, source revision and supported syntax. The released syntax is
`get m1l1 --type skills --name NAME`; the positional argument is a lesson reference,
not a skill name. Verify the corresponding lesson and skill in the content.
Neither a local build nor a higher version number proves both. If skill-filter support
is unavailable, continue preparing the project and public helpers, and report the
specific pending capability before download. Do not substitute a full lesson or
another course without the user's choice.

For npm/npx verify Node against that package's `engines` (the inspected baseline
requires Node 20+). When there is no suitable global CLI, the pinned npx runner in
the reference avoids a global install. Respect a user's requested global or
standalone method; use its matching install/update procedure. Carry forward
existing authorization for installation. A permissions error is not a reason for
automatic `sudo`, a global config reset or deleting credentials.

Re-run version/help after an install or update. Keep one exact runner throughout
setup and guide so an older `10x` on PATH cannot replace the verified npx version.
With no network, inspect available local version/help and matching packaged
documentation; leave publication, access and download checks unverified. Do not
claim setup is complete from an offline version check.

## 3. Check authentication separately from course availability

Run the selected runner's `auth --status`. It can contact the course API but does
not request a login email. Inspect both session validity and live access status:
a valid token or successful exit does not prove `access_checked` or v4 access.
Keep the error when access could not be checked.

Only when login is required, have the user run the verified `auth` command in an
interactive terminal and complete its displayed flow. The inspected version uses
a magic link sent by email or a Circle message (`--method email` /
`--method circle`); follow the selected release's help. Do not request email, open magic links or perform login
on the user's behalf without their authorization. Never read out `auth.json`,
tokens, magic-link URLs or email contents. Summarize only session/access state.

Then use the selected runner's `list --course 10xdevs4` (or the user's explicit
course). Distinguish no membership, unpublished course, locked module and network
failure. Reinstalling the CLI or selecting a different tool does not grant access.
Keep `--course`, `--tool` and `--lang` explicit in subsequent download/sync commands.

## 4. Diagnose readiness without manufacturing a tool directory

Run the selected runner's `doctor --json`; read all of `data.checks` and
`data.overall`, plus the exit status. The outer `status: "ok"` is an output envelope,
not a promise that every check passed. Doctor uses the configured profile (or its
default), so compare the reported tool with the intended one; it has no `--tool`
flag in the inspected baseline.

In a new project before the first download, a missing `.claude/` (or the reported
profile directory) can be expected. If that is the only failure and this is the
correct writable project, explain that the first successful download creates it.
Do not create a dummy directory just to turn the check green. Preserve and address
any auth, access, API, binding or write-permission failure separately. An update
lookup skipped offline does not establish that the CLI is current.

## 5. Hand off to the actual guide copy

Locate the project's installed `10x-cli-guide/SKILL.md` and its own
`references/compatibility.md`. Check its installation channel/owner using the
reference before adding or updating it. If absent, install guide through the
chosen public on-demand or compatible CLI channel; verify the resulting files.
Installing the npm CLI alone does not activate either helper in an agent. Do not
claim that an absent guide is available or rely on unverified slash-command
discovery. Tell the agent to read the exact materialized guide path and its local
reference.

Pass this compact context in the conversation, without secrets:

```text
Project: absolute cwd; course binding or unbound
Course / tool / requested language: 10xdevs4 / claude-code / pl (or user's choice)
Runner: exact executable or pinned npx command; observed version and source ref
CLI install/update method: npx pin / npm global / standalone asset
Auth: valid / login required / unknown; live course access and module state
Setup helper: actual path, public or CLI owner, observed source ref if known
Guide helper: actual path, owner and source ref if known; full reference present
Readiness: verified checks; remaining release/network/access issues, if any
Next task: guide's download → use → sync journey, retaining this context
```

Once ready, continue in guide without rerunning installation or asking the user
to repeat choices already supplied. Report remaining blockers precisely if the
download cannot yet run; do not present preparation as a completed real journey.
