---
name: 10x-cli-guide
description: "Invoke this skill when the user asks how to USE the 10x-cli day-to-day — fetching lessons, listing modules, switching AI tools, troubleshooting errors, understanding where artifacts land, checking the 10xBench model leaderboard, or working on a specific OS (Windows, Linux, macOS). Covers commands (get, list, doctor, auth --status/--logout, bench), tool profiles, artifact locations, common errors, and platform-specific tips. Excludes: first-time installation and onboarding (use 10x-cli-setup instead), developing or contributing to 10x-cli source code, and general programming help."
---

# 10x-cli Daily Usage Guide

This skill helps users work with `@przeprogramowani/10x-cli` after it is already installed and authenticated. If the user has not installed or authenticated yet, hand off to the **10x-cli-setup** skill instead.

## Step 1: Detect the user's environment

Before giving any guidance, gather context silently — run these checks and remember the results. Do not print raw output to the user.

### Operating system

```bash
echo "$OSTYPE" 2>/dev/null || echo "win32"
```

Use the result to tailor path separators, shell syntax, and clipboard commands throughout your answers:

| OS | Shell | Home var | Clipboard | Temp dir |
|----|-------|----------|-----------|----------|
| macOS (`darwin*`) | zsh / bash | `$HOME` | `pbcopy` | `$TMPDIR` |
| Linux (`linux-gnu*`) | bash / zsh | `$HOME` | `xclip -selection clipboard` or `xsel --clipboard` | `/tmp` |
| Windows (`win32` / MSYS / Git Bash) | PowerShell / cmd | `%USERPROFILE%` | `clip.exe` | `%TEMP%` |

### Active AI tool

```bash
10x doctor --json 2>/dev/null | head -1
```

Also check which tool profile is configured:

```bash
cat ~/.config/10x-cli/config.json 2>/dev/null || cat "$APPDATA/10x-cli/config.json" 2>/dev/null || echo "{}"
```

If the config contains a `"tool"` key, that is the active profile. If not, the default is `claude-code`.

### CLI version

```bash
10x --version
```

## Step 2: Answer the user's question using the reference below

Use the environment context from Step 1 to personalize every answer. Always use the OS-appropriate shell syntax, paths, and commands. Never show macOS-specific commands to a Windows user or vice versa.

---

## Command Reference

### `10x get <ref>` — Fetch and apply lesson artifacts

The primary daily command. Fetches a lesson bundle from the API and writes skills, prompts, rules, and config templates to the project directory.

```bash
10x get m1l1              # Fetch module 1, lesson 1
10x get m2l3              # Fetch module 2, lesson 3
10x get m1l1 --dry-run    # Preview what would be written
10x get m1l1 --tool cursor  # Use a different AI tool profile
10x get m1l1 --lang pl    # Fetch Polish content
```

**Filtering artifacts:**

```bash
10x get m1l1 --type skills                     # Only skills
10x get m1l1 --type skills --name code-review  # One specific skill
10x get m1l1 --print --type skills --name code-review  # Print to stdout
```

**Where artifacts land** (depends on the active tool profile):

| Tool | Skills | Prompts | Rules file | Config templates |
|------|--------|---------|------------|------------------|
| Claude Code | `.claude/skills/<name>/SKILL.md` | `.claude/prompts/<name>.md` | `CLAUDE.md` | `.claude/config-templates/<name>` |
| Cursor | `.cursor/skills/<name>/SKILL.md` | `.cursor/prompts/<name>.md` | `.cursor/rules/10x-course.mdc` | `.cursor/config-templates/<name>` |
| GitHub Copilot | `.github/skills/<name>/SKILL.md` | `.github/prompts/<name>.md` | `.github/copilot-instructions.md` | `.github/config-templates/<name>` |
| Codex CLI | `.agents/skills/<name>/SKILL.md` | `.agents/prompts/<name>.md` | `AGENTS.md` | `.agents/config-templates/<name>` |
| Devin Desktop | `.devin/skills/<name>/SKILL.md` | `.devin/prompts/<name>.md` | `AGENTS.md` | `.devin/config-templates/<name>` |
| Generic | `.ai/skills/<name>/SKILL.md` | `.ai/prompts/<name>.md` | `AGENTS.md` | `.ai/config-templates/<name>` |

**Re-applying a lesson** overwrites skills and prompts if content changed, updates the rules sentinel block, but never overwrites config templates (they may contain user edits).

**Switching lessons** cleans up artifacts from the previous lesson that are not in the new one, keeps shared artifacts, and adds new ones.

### `10x list [module]` — Browse available content

```bash
10x list       # Show all modules with lock state
10x list m1    # Show lessons in module 1
```

Locked modules show their unlock date. Use this to see what is available before fetching.

### `10x doctor` — Diagnose problems

Runs 5 checks: Auth status, API connectivity, Config directory, CLI version, and tool directory presence.

```bash
10x doctor          # Human-readable output
10x doctor --json   # Machine-readable for scripting
```

Exit code 78 means at least one check failed.

### `10x auth` — Session management

```bash
10x auth             # Start magic-link login
10x auth --status    # Check current session
10x auth --logout    # Clear credentials
```

Sessions refresh transparently — if a token is near expiry, the next command refreshes it automatically. You only need to re-auth manually if the session has fully expired.

### `10x bench` — 10xBench model leaderboard

```bash
10x bench             # Top 10 AI models with color-coded score bars
10x bench --limit 5   # Just the top 5
10x bench --json      # Machine-readable envelope (also when piped)
```

Shows the live leaderboard from [10xbench.ai](https://10xbench.ai) — AI models
benchmarked on vibe-coding the Przeprogramowani.pl website. Each row has the
average score, number of runs, cost per run where measured, and the agent
harness used. **No authentication needed** — this works before `10x auth`.
Data updates when new benchmark results are published; superseded model
versions are already filtered out upstream. If it reports the leaderboard as
unavailable, the site may be mid-deploy — retry in a few minutes.

---

## Switching Tools

To change your AI tool (e.g., from Claude Code to Cursor):

```bash
10x get m1l1 --tool cursor
```

The CLI will detect that artifacts from the old tool exist and offer two options:

1. **Migrate** (default) — move all artifacts to the new tool's directories, remove the sentinel block from the old rules file.
2. **Delete** — remove only 10x-managed artifacts from the old tool's directories. Your own files (e.g., `.github/workflows/`) are never touched.

The tool choice is saved in the config file (`~/.config/10x-cli/config.json` on macOS/Linux, `%APPDATA%/10x-cli/config.json` on Windows). Future `get` commands will use the new tool without needing `--tool` again.

---

## Platform-Specific Tips

### Windows

- **Use PowerShell** (not cmd.exe). The CLI outputs ANSI colors and Unicode symbols that render correctly in Windows Terminal + PowerShell but may garble in legacy cmd.
- **npx works fine**: `npx @przeprogramowani/10x-cli get m1l1` — no global install needed. Node 20+ is the only prerequisite.
- **Clipboard**: Skills that copy to clipboard use `clip.exe` on Windows. If a skill outputs a clipboard command, it will fall back silently if `clip.exe` is unavailable.
- **Config location**: `%APPDATA%\10x-cli\config.json` and `%APPDATA%\10x-cli\auth.json`. The CLI creates these automatically.
- **Path separators**: The CLI uses Node's `path.join()` internally, so forward slashes in command output (like `.claude/skills/code-review/SKILL.md`) work fine on Windows — no need to convert them.

### Linux

- **Clipboard**: Skills use `xclip -selection clipboard` or `xsel --clipboard`. If neither is installed, clipboard operations fail silently. Install with `sudo apt install xclip` (Debian/Ubuntu) or `sudo dnf install xclip` (Fedora).
- **Config location**: `~/.config/10x-cli/` (respects `$XDG_CONFIG_HOME` if set).

### macOS

- **Clipboard**: Skills use `pbcopy` — works out of the box.
- **Config location**: `~/.config/10x-cli/`.

---

## Troubleshooting

When the user reports a problem, follow this sequence:

### 1. Run doctor first

```bash
10x doctor
```

This catches the most common issues. Read the output and address each failing check.

### 2. Common problems and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "You're not signed in" | No auth or expired session | `10x auth` |
| "Session expired" | Token past expiry and auto-refresh failed | `10x auth` (re-login) |
| API unreachable / timeout | Network issue or API outage | Check internet; retry in a few minutes |
| "Module is locked" | Content not yet released | `10x list` to see unlock date |
| `.claude/` not found (doctor fail) | Running from wrong directory or wrong tool profile | `cd` to project root; check `10x doctor --json` for which tool is configured |
| "403 Forbidden" on `10x get` | Module locked or no membership | Check `10x list` for module state; verify enrollment |
| Orphaned artifact prompt on `get` | Switching tools mid-lesson | Choose "migrate" to move files, or "delete" to clean up |
| Permission denied writing files | Directory not writable | Check directory permissions; on POSIX: `chmod u+w <dir>` |

### 3. Verbose mode for deeper debugging

```bash
10x get m1l1 --verbose
10x doctor --verbose
```

This prints request/response diagnostics to stderr, useful for diagnosing API or network issues.

### 4. Nuclear reset

If config is corrupted:

On macOS/Linux:
```bash
rm -rf ~/.config/10x-cli
10x auth
```

On Windows (PowerShell):
```powershell
Remove-Item -Recurse -Force "$env:APPDATA\10x-cli"
10x auth
```

This clears auth and tool preference. The next `10x auth` recreates everything.

---

## Important Principles

- **Answer with the user's OS and tool in mind.** Never show `pbcopy` to a Windows user. Never show `%APPDATA%` to a macOS user.
- **Run `10x doctor` before speculating.** It catches 80% of issues.
- **Don't guess command syntax from memory.** If unsure about a flag or behavior, fetch the latest README: `https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md`
- **Distinguish tool profile issues from CLI issues.** If artifacts land in the wrong directory, it is a tool profile question. If the command itself fails, it is a CLI/auth/network question.
