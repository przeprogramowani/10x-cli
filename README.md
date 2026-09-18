# 10x-cli

CLI tool for [10xDevs](https://10xdevs.pl) course content. Fetch and apply AI coding skills,
prompts, and configs directly into your workspace.

## Requirements

- **Node 20+** — this is the only runtime dependency.

Corporate firewall / proxy allowlist (for security and sysadmin teams):
Polish [docs/wymagania-sieciowe.md](docs/wymagania-sieciowe.md),
English [docs/network-requirements.md](docs/network-requirements.md).

## Install

```bash
# Zero-install — run directly with npx (no global install needed)
npx @przeprogramowani/10x-cli auth
npx @przeprogramowani/10x-cli get m1l1

# Or install globally for shorter commands
npm install -g @przeprogramowani/10x-cli

# Or download a standalone binary from GitHub Releases
# https://github.com/przeprogramowani/10x-cli/releases
```

## Install the bundled CLI helpers (unreleased)

`10x helpers install` is implemented on this branch for the next CLI release;
it is **not available in 1.21.0 or the 1.22.0 master baseline**. A checkout build
may still print 1.22.0 until the release process assigns a version. Check
`10x helpers --help` on your actual executable before using this command; do not
assume that installing today's npm version includes it.

Once your release includes it, run from the intended project directory:

```bash
10x helpers install --tool copilot --dry-run
10x helpers install --tool copilot
```

This installs **both** `10x-cli-setup` and `10x-cli-guide`, each with its complete
`SKILL.md` and `references/compatibility.md`, into `.github/skills/`. Use
`--tool claude-code`, `cursor`, `codex`, `devin-desktop`, `gemini`, `kiro`, or `generic`
when that is your intended tool. The target must be explicit; installation is
project-only. There is no `--global`, automatic agent detection, `skills`/npx
subprocess, authentication, or network access. The helper bytes come from the
same CLI build, including the standalone binary; fetching the npm CLI itself
still requires npm/network in the usual way.

Identical existing files are unchanged; missing files are created. If any existing
helper file differs, neither helper is written and the command exits 1. Keep the
existing copy or back up your changes outside managed skill directories before
replacing it deliberately. Files managed by course `10x get`/`sync` remain under
that channel; this command does not register or take over a course manifest.
It never deletes extra local files. A filesystem failure also exits 1; any files
already created remain, and rerunning safely checks them again. `--dry-run`
performs the same path/conflict checks without writes. Invalid/missing targets or
unsupported flags exit 2 in both human and JSON use.

For Copilot CLI, run `/skills reload`, then `/skills info 10x-cli-setup` and
`/skills info 10x-cli-guide` in the same project. Installing helpers does not
execute them or authenticate the course CLI. VS Code Copilot also reads project
`.github/skills`; open the same project there.

To try the **unreleased source checkout** without changing a global installation:
run `bun run /absolute/path/to/10x-cli/src/index.ts helpers install --tool copilot`
from a disposable project, with dependencies already installed in the checkout.
The public `skills` route below remains available for older CLI releases. Its
Copilot agent ID is `github-copilot`, whereas this CLI uses `--tool copilot`.

## Agentic Installation

The [`10x-cli-setup`](skills/10x-cli-setup/SKILL.md) helper prepares the CLI and
passes project context to [`10x-cli-guide`](skills/10x-cli-guide/SKILL.md), which
leads through download → an actual agent task → sync. Each ships its own
[compatibility reference](skills/10x-cli-guide/references/compatibility.md).
Installing the npm CLI does not activate these helpers in your agent.

For public installation on demand, choose a full retained public CLI master SHA
containing the helper version you want. From your project root (macOS/zsh):

```bash
: "${CLI_SKILLS_REF:?Set the full public CLI master SHA containing the helpers}"
npx --yes skills@1.5.26 add "https://github.com/przeprogramowani/10x-cli/tree/$CLI_SKILLS_REF/skills" --skill 10x-cli-setup --agent claude-code --copy
# Install guide when needed using the same channel:
npx --yes skills@1.5.26 add "https://github.com/przeprogramowani/10x-cli/tree/$CLI_SKILLS_REF/skills" --skill 10x-cli-guide --agent claude-code --copy
```

These are project copies. Installer prompts remain enabled; `npx --yes` only
accepts running the pinned tool. Inspect the actual installed paths and ask the
agent to read that SKILL.md and its references. No automatic discovery is assumed.

Both helpers can also be downloaded through the CLI once filtered get is supported
by your verified release and v4 m1l1 content is published and accessible. In a
separate project from public copies, after setup/auth:

```bash
: "${CLI_VERSION:?Set the actual verified published CLI version}"
10x_cli() { npx --yes "@przeprogramowani/10x-cli@$CLI_VERSION" "$@"; }
10x_cli --version
10x_cli get --help
10x_cli get m1l1 --type skills --name 10x-cli-setup --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-cli-setup --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-cli-guide --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-cli-guide --course 10xdevs4 --tool claude-code --lang pl
```

Source membership does not prove publication. Confirm skill-filter support and direct
sync against the actual package and content; do not infer it from a version label
or silently replace the name with a full lesson. CLI-owned copies update through
sync; public copies update through a deliberate new source SHA and pinned add.
The CLI executable has its own npm/binary update procedure.

Keep one updater per copy. Before either route, inspect destination paths/symlinks
and CLI/installer ownership. For public→CLI takeover, back up the whole helper
outside managed trees, unregister only that helper through the original installer,
verify its destination and registration are gone, then filtered get. Preserve local
edits for conscious merging. For CLI→public use a new project; no verified CLI
per-skill unregister is promised. See the compatibility reference for details.

## Quick Start

Use an existing verified global/standalone `10x`, or the pinned `10x_cli` runner
above. Retain your v3 project and use a separate v4 exercise directory. After
checking skill-filter capability and content availability. Sync later refreshes
whole downloaded lessons, so inspect its preview and accept any additional
artifacts/rules before applying; repeat a skill filter for a narrow update:

```bash
10x_cli auth --status
# If login is needed: 10x_cli auth (email or Circle); see auth commands below.
10x_cli list --course 10xdevs4
10x_cli get m1l1 --type skills --name 10x-idea-check --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-idea-check --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-init --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-init --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-shape --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-shape --course 10xdevs4 --tool claude-code --lang pl
10x_cli get m1l1 --type skills --name 10x-prd --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli get m1l1 --type skills --name 10x-prd --course 10xdevs4 --tool claude-code --lang pl
# Follow the guide: read each installed SKILL.md and references, then
# init → shape with the learner’s 10xCards inputs → PRD from approved notes.
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl --dry-run
10x_cli sync --course 10xdevs4 --tool claude-code --lang pl
10x_cli doctor
```

The guide uses lesson 1's existing 10xCards example and produces
`context/foundation/shape-notes.md`, then `context/foundation/prd.md`.
Lesson setup installs all four skill trees. Use `10x-idea-check` and its references
first when you want to assess an idea; it is optional before init → shape → PRD.
Read the installed entrypoints and their references; PRD requires the sibling
`.claude/skills/10x-shape/references/prd-schema.md`. Preserve existing outputs and
follow the skills' collision choices. `CLAUDE-m1l1` is a separate lesson rule;
see the guide for prerequisite checks without a full-get fallback. `10x-plan`
is not available for this launch demonstration. CLI 1.21.0 and v4 m1 EN/PL are
published; these revised helpers remain a separate source change. Verify each
filtered preview and complete PL references before the walkthrough. A download alone is not successful skill use.
Inspect sync conflicts even on exit 0; never apply automatic `--force`. A missing
tool directory before first get can explain that doctor check; other failures
remain visible. Full lesson downloads and other commands remain available below.

## Commands

| Command | Description |
|---------|-------------|
| `10x auth` | Magic-link login with your Circle-registered email |
| `10x auth --method circle` | No email received? Get the approval link as a Circle message instead |
| `10x list` | Browse modules and lessons in your course |
| `10x get <ref>` | Fetch a lesson and apply artifacts to your workspace |
| `10x sync` | Bulk-download / refresh lessons and report what changed upstream |
| `10x doctor` | Diagnose auth, API connectivity, and local config |
| `10x bench` | Live top-10 AI model leaderboard from [10xbench.ai](https://10xbench.ai) — no login needed |
| `10x bench-kit <action>` | Create (`init`) and update (`update`) a company benchmark instance from the [10x-bench-kit](https://github.com/przeprogramowani/10x-bench-kit) template |

### `10x get` Flags

| Flag | Description |
|------|-------------|
| `--tool <tool>` | AI coding tool: `claude-code`, `cursor`, `copilot`, `codex`, `devin-desktop`, `gemini`, `kiro`, `generic` |
| `--print` | Output artifact content to stdout instead of writing files |
| `--type <type>` | Filter by artifact type: `skills`, `prompts`, `rules`, `configs` |
| `--name <name>` | Filter by artifact name (requires `--type`) |
| `--dry-run` | Show what would be written without touching the filesystem |
| `--course <slug>` | Select an entitled course ID or slug; default is the project edition or API recommendation |
| `--no-course-rules` | Skip the course rules block in your rules file (`CLAUDE.md`/`AGENTS.md`); removes an unchanged block whose ownership and baseline are known. Use `--course-rules` to re-enable. |

#### Examples

```bash
# Fetch full lesson — writes skills, prompts, rules, configs
10x get m1l1

# Write only skills (skip prompts, rules, configs)
10x get m1l1 --type skills

# Write a single artifact
10x get m1l1 --type skills --name code-review

# Print to stdout (pipe-friendly)
10x get m1l1 --print --type skills --name code-review
10x get m1l1 --print --type skills --name code-review | pbcopy

# Use with a different AI coding tool
10x get m1l1 --tool cursor

# Skip the course rules block (use only your rules). Persisted across runs;
# an unchanged block with a known baseline is removed. Re-enable later with --course-rules.
10x get m1l1 --no-course-rules
10x get m1l2 --course-rules

# An explicit rules request always applies, even with the opt-out persisted
10x get m1l1 --type rules
```

> The `--no-course-rules` / `--course-rules` choice is saved as `courseRules`
> in `config.json` and applies to subsequent plain `10x get` runs. An explicit
> `--type rules` request overrides the opt-out for that run. Skills, prompts,
> and config-templates are unaffected.

### `10x sync`

`10x sync` keeps your downloaded lessons up to date and tells you **what changed
upstream** since you last fetched. By default it refreshes only the lessons you've
already downloaded; `--all` pulls every unlocked lesson at once.

Unchanged lessons are skipped **without a download** — the catalog advertises a
per-lesson `contentHash` that the CLI compares against what it last applied, so the
common "nothing changed" case avoids lesson downloads. Skipping also requires the same language/tool/rules representation and intact tracked local files; missing files are repaired and local edits still surface as conflicts.

| Flag | Description |
|------|-------------|
| `--all` | Sync every unlocked lesson, not just the ones you've downloaded |
| `--module <m>` | Limit to one module (e.g. `m2` or `2`) |
| `--dry-run` | Preview what would change without writing anything |
| `--force` | Fetch again and overwrite local skill/prompt edits; protected rules and config templates remain guarded |
| `--tool <tool>` | AI coding tool (same set as `get`) |
| `--lang <lang>` | Content language: `en` (default) or `pl` |
| `--course <slug>` | Select an entitled course ID or slug; default is the project edition or API recommendation |
| `--no-course-rules` | Skip the course rules block (same semantics as `get`) |

```bash
# Refresh everything you've already downloaded; report what moved
10x sync

# Pull every unlocked lesson in one shot (fresh project)
10x sync --all

# Preview changes without writing
10x sync --dry-run

# Only module 2
10x sync --module m2

# Take all upstream updates, overwriting local edits
10x sync --force
```

The report classifies every resource as **upstream-updated**, **created**,
**unchanged**, **skipped (conflict)**, or **removed**. When a file you edited
locally also changed upstream, sync **keeps your edit** and prints the exact
command to take the update, e.g.:

```
m2l3 — conflicts (1 skipped)
    skipped skills/auth-skill (SKILL.md) — you edited it → 10x get m2l3 --type skills --name auth-skill
```

Run that `10x get …` to take a single update, or `10x sync --force` to take them
all for skills and prompts. Config templates are create-only. Course rules retain a separate upstream baseline: local edits or a missing baseline require explicit resolution, including when `--force` or `--no-course-rules` is used. Text outside the managed markers is preserved.

**Exit code is worst-outcome:** `0` when everything is clean/unchanged (a skipped
conflict is reported, not a failure), `1` if any lesson failed to fetch. The full
report is still emitted on a partial failure.

### `10x bench`

Shows the [10xBench](https://10xbench.ai) leaderboard — the top 10 AI models
benchmarked on vibe-coding the Przeprogramowani.pl website — rendered as
color-coded score bars in your terminal. Public data, works without logging in.

```bash
10x bench             # Top 10 models with scores, runs, and cost per run
10x bench --limit 5   # Just the top 5
10x bench --json      # Machine-readable (also auto-selected when piped)
```

The data refreshes whenever new benchmark results are published on 10xbench.ai.
Colors honor `NO_COLOR` and are disabled automatically when output is piped.

### `10x bench-kit`

Creates and maintains a **company benchmark instance** from the
[10x-bench-kit](https://github.com/przeprogramowani/10x-bench-kit) template —
a self-hosted benchmark that scores AI agents on tasks embedded in your own
repositories. The CLI is a thin installer/updater; tasks, assertions, and
scoring live in the template and the instance.

| Action | Description |
|--------|-------------|
| `init [dir]` | Materialize a fresh instance from the template (no git history, fresh `git init`), register the detected base repo, install runner dependencies |
| `update [dir]` | Upgrade the instance to a newer template: runtime zone replaced wholesale, skills proposed as a reviewable diff, company content untouched |

| Flag | Description |
|------|-------------|
| `--template-version <tag>` | Template tag to install (default: latest) |
| `--tool <id>` | Agent tool for skill placement (`claude-code`, `cursor`, `copilot`, `codex`, `devin-desktop`, `gemini`, `kiro`, `generic`) |
| `--yes` | Run non-interactively, accepting defaults |
| `--deep` | Clone the detected base repo with full history (default: shallow, HEAD only) |

```bash
# Create an instance next to your product repo (run inside it to auto-register)
10x bench-kit init my-benchmark

# Pin the template version
10x bench-kit init my-benchmark --template-version v0.8.0

# Keep the full history in the base repo clone under .repos/
10x bench-kit init my-benchmark --deep

# Upgrade an existing instance to the latest template
10x bench-kit update
```

A detected base repo is cloned into the instance's `.repos/<name>/` (gitignored)
as a working copy for the authoring skills. That clone is **shallow** — HEAD only
— because the skills read the file tree, not the history; `--deep` keeps the full
history, and `git fetch --unshallow` inside the clone adds it later.

Re-running `init` on an existing instance is a **repair**: missing template
files are restored, company content is never touched. After `update`, run the
instance's `bench validate` to confirm the content still matches the new kit.

### Global Flags

- `--json` — Machine-readable JSON output (auto-detected when piped)
- `--verbose` — Request/response diagnostics on stderr
- `--version` — Print CLI version
- `--help` — Show help

### Lesson References

Lessons are referenced by module and lesson number:

- `m1l1` — Module 1, Lesson 1
- `m2l3` — Module 2, Lesson 3

### Multi-Tool Support

On first run, the CLI prompts you to choose your AI coding tool. Artifacts are written to the correct directory for your tool:

| Tool | Directory | Rules file |
|------|-----------|------------|
| Claude Code | `.claude/` | `CLAUDE.md` |
| Cursor | `.cursor/` | `.cursor/rules/10x-course.mdc` |
| GitHub Copilot | `.github/` | `.github/copilot-instructions.md` |
| Codex CLI | `.agents/` | `AGENTS.md` |
| Devin Desktop | `.devin/` | `AGENTS.md` |
| Gemini CLI | `.gemini/` | `GEMINI.md` |
| Kiro | `.kiro/` | `AGENTS.md` |
| Generic | `.ai/` | `AGENTS.md` |

Override with `--tool <name>`. Validated writing commands save your choice in `~/.config/10x-cli/config.json`. Previews leave it unchanged.
The former `windsurf` ID remains accepted as an alias and is upgraded to
`devin-desktop`; existing `.windsurf/` artifacts can be migrated by the normal
tool-switch prompt.

## Development

```bash
bun install
bun run dev -- --help       # Run CLI from source
bun run build               # Build dist/index.mjs (node target)
bun run build:binary        # Build standalone binary (~59MB)
bun test                    # Run tests
bun run typecheck           # tsc --noEmit
bun run lint                # oxlint
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit using [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, etc.)
4. Push and open a pull request

CI runs lint, typecheck, tests, and build checks on every PR. Releases are automated on merge to `master` via conventional-commit analysis.

## License

MIT

## Course selection and project edition

`get`, `list`, and `sync` select the explicit `--course` first, then the project's edition, then the live API recommendation. A new project with only v3 access selects v3, with only v4 selects v4, and with both selects published, available v4. An unpublished v4 can leave v3 as the recommendation; network or backend failures are reported instead of falling back. Output includes the course and selection reason.

The first validated write records `{ "version": 1, "course": "10xdevs4" }` (or `10xdevs3`) in the root `.10x-cli.json`, shared across AI tool profiles. Existing supported v2/v3 manifests preserve their recorded edition. All profiles, including legacy Windsurf, must agree. Corrupt, unknown-version, or conflicting manifests block writes and must be preserved for repair. Artifact names never infer an edition.

Ordinary `get` and `sync` cannot change a bound project's edition. Start v4 in a separate directory while retaining the v3 project. Read-only inspection of another entitled edition is allowed with `--course`. Do not delete the binding or manifests to bypass an edition conflict. Course edition and manifest schema version are separate concepts.

`list`, `get --print`, `get --dry-run`, `sync --dry-run`, and `doctor` preserve project files and tool/language preferences, including interactive tool choices. Auth token rotation may update only the credential store. Failed download, signature, course, or path validation leaves a new project unbound. Once writing starts, its binding remains even if an I/O operation fails, so retry stays on the same edition. `auth --status` and `doctor` distinguish token expiry from live course access.


## Candidate verification and v4 release

Using v4 requires a CLI version with course discovery and project edition binding.
Existing v3 projects remain usable without a new flag or an edition migration.
Start v4 in a separate project directory; this release includes no edition migration
command. Support files inside each skill directory are downloaded together with
`SKILL.md`, including selector and stack-assessment references.

Before publication, CI tests the exact CLI and Toolkit candidate commits together
on Linux and Windows using real local auth callback, polling and token refresh.
It also exercises the actual released npm 1.20.0 CLI against the candidate API and
this candidate against existing v2/v3-manifest projects. Automated fixtures send no
emails. npm latest or a different branch cannot stand in for the candidate binary.

The private Toolkit release runbook `docs/how-to/release-10xdevs4-cli.md` documents
the required full candidate SHA pair, vetted v3 fixture artifact, exact v4 stage
and secured preparation Worker/content revisions. Publication depends on the
coordinated gate plus normal Linux/Windows tests, builds and smoke checks. The
operator must still verify secured production access and final v4 content before
npm publication; passing a local test does not execute that rollout.

For deterministic contract checks, export `/openapi.json` from the exact local
candidate Worker, then run:

```bash
OPENAPI_SPEC_PATH=/absolute/candidate-openapi.json bun run generate-types --check
```

Check mode reads that file and compares the generated result without changing
`src/generated/api-types.ts`. To regenerate, omit `--check` while keeping the same
source file. Do not regenerate candidate contracts from the production API.
