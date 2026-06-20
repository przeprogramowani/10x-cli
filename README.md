# 10x-cli

CLI tool for [10xDevs](https://10xdevs.pl) course content. Fetch and apply AI coding skills,
prompts, and configs directly into your workspace.

## Requirements

- **Node 20+** — this is the only runtime dependency.

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

## Agentic Installation

Let your AI coding agent handle the setup. This repo ships a [`10x-cli-setup`](skills/10x-cli-setup/SKILL.md) skill that walks your agent through installing, authenticating, and configuring the CLI — all driven by the latest README.

Install the skill with [skills.sh](https://skills.sh):

```bash
# Add the skill to your current project (symlinked)
npx skills add przeprogramowani/10x-cli

# Or install globally so it's available in every project
npx skills add przeprogramowani/10x-cli -g

# Target a specific agent
npx skills add przeprogramowani/10x-cli -a claude-code
npx skills add przeprogramowani/10x-cli -a cursor
```

Once installed, just tell your agent to **set up 10x-cli** and it will pick up the skill automatically.

## Quick Start

```bash
10x auth        # Authenticate with your email
10x list        # Browse available modules and lessons
10x get m1l1    # Fetch and apply lesson artifacts
10x sync        # Update everything you've downloaded; show what changed
10x doctor      # Check everything is working
```

## Commands

| Command | Description |
|---------|-------------|
| `10x auth` | Magic-link login with your Circle-registered email |
| `10x list` | Browse modules and lessons in your course |
| `10x get <ref>` | Fetch a lesson and apply artifacts to your workspace |
| `10x sync` | Bulk-download / refresh lessons and report what changed upstream |
| `10x doctor` | Diagnose auth, API connectivity, and local config |

### `10x get` Flags

| Flag | Description |
|------|-------------|
| `--tool <tool>` | AI coding tool: `claude-code`, `cursor`, `copilot`, `codex`, `windsurf`, `gemini`, `generic` |
| `--print` | Output artifact content to stdout instead of writing files |
| `--type <type>` | Filter by artifact type: `skills`, `prompts`, `rules`, `configs` |
| `--name <name>` | Filter by artifact name (requires `--type`) |
| `--dry-run` | Show what would be written without touching the filesystem |
| `--course <slug>` | Override the course slug (default: `10xdevs3`) |
| `--no-course-rules` | Skip the course rules block in your rules file (`CLAUDE.md`/`AGENTS.md`); strips an existing one. Use `--course-rules` to re-enable. |

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
# a previously-applied block is stripped. Re-enable later with --course-rules.
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
common "nothing changed" case is a single catalog request.

| Flag | Description |
|------|-------------|
| `--all` | Sync every unlocked lesson, not just the ones you've downloaded |
| `--module <m>` | Limit to one module (e.g. `m2` or `2`) |
| `--dry-run` | Preview what would change without writing anything |
| `--force` | Ignore the cheap-skip digest and overwrite local edits with upstream |
| `--tool <tool>` | AI coding tool (same set as `get`) |
| `--lang <lang>` | Content language: `en` (default) or `pl` |
| `--course <slug>` | Override the course slug (default: `10xdevs3`) |
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
all. **Change visibility covers skills and prompts** — configs are create-only
(never overwritten) and rules are sentinel-managed, so they aren't part of the
"what changed" report.

**Exit code is worst-outcome:** `0` when everything is clean/unchanged (a skipped
conflict is reported, not a failure), `1` if any lesson failed to fetch. The full
report is still emitted on a partial failure.

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
| Windsurf | `.windsurf/` | `.windsurfrules` |
| Gemini CLI | `.gemini/` | `GEMINI.md` |
| Generic | `.ai/` | `AGENTS.md` |

Override anytime with `--tool <name>`. Your choice is saved in `~/.config/10x-cli/config.json`.

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
