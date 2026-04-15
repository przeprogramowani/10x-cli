---
name: 10x-cli-setup
description: ALWAYS invoke this skill when the user mentions 10x-cli, @przeprogramowani/10x-cli, the 10xDevs CLI, or the 10xDevs course environment in a setup context. This skill fetches the live README — Claude does not know 10x-cli's current install steps without it. Applies to: installing, updating, reconfiguring for different AI tools (Cursor, Copilot, Claude Code), permission/npm errors, authentication, and onboarding after 10xDevs enrollment. Excludes: developing 10x-cli source code, contributing to the repo, building similar CLIs, or general project setup.
---

# 10x-cli Setup

This skill sets up the `@przeprogramowani/10x-cli` on the user's machine. The core principle is simple: **the README is the single source of truth**. The CLI evolves — version requirements change, new install methods appear, commands get updated. Rather than hardcoding any of that here, this skill tells you *how to work*, and the README tells you *what to do*.

## Step 1: Check if the CLI is already installed

Before anything else, check the current state:

```bash
10x --version 2>/dev/null || echo "NOT_INSTALLED"
```

- If a version is printed, the CLI is already installed. Tell the user and ask if they want to update, reconfigure, or troubleshoot.
- If not installed, proceed to Step 2.

This avoids wasting time on prerequisites when the user might just need a config change or re-auth.

## Step 2: Fetch the latest README

Retrieve the current README from GitHub — this is the authoritative source for all install steps, prerequisites, commands, and tool configurations:

```
URL: https://raw.githubusercontent.com/przeprogramowani/10x-cli/refs/heads/master/README.md
```

Use WebFetch or `curl -sL` to get it. If the fetch fails, tell the user and stop — don't guess at install steps from memory, because they may be outdated.

## Step 3: Build a plan from the README and execute it

Read the fetched README and construct a step-by-step setup plan from it. The README contains everything needed: prerequisites, install commands, auth flow, available commands, and tool-specific configuration. Your job is to translate the README into actionable steps for the user's specific situation.

The general flow from the README is:
1. **Prerequisites** — whatever the README says is required (runtime version, package manager, etc.). Check each one and stop if something is missing.
2. **Install** — use the install method described in the README. Verify it worked.
3. **Authenticate** — the README describes the auth command and flow. Note: auth is interactive (magic-link email), so the user may need to run it themselves via `! 10x auth` if the shell doesn't support input.
4. **Verify** — the README lists a diagnostic command. Run it and review the output with the user.
5. **Explore** — show the user how to browse and fetch content using the commands from the README.
6. **Tool configuration** — if the user mentioned a specific AI tool (Claude Code, Cursor, etc.), use the README's multi-tool support section to configure it. If not, explain the options and let them choose.

Do not hardcode specific version numbers, command flags, or directory paths — read them from the README. This way the skill stays correct even when the CLI changes.

## Important principles

- **README over memory.** If you think you know a command or requirement, but the fetched README says something different, follow the README. Always.
- **Check before installing.** Step 1 exists for a reason — don't reinstall what's already there.
- **Be interactive.** Confirm with the user before installing global packages or modifying their system. Ask before running `sudo`.
- **Diagnose before fixing.** If something fails, read the error and the README's guidance before suggesting a fix. Don't just retry blindly.
- **Stay focused on end-user setup.** This skill is about installing and configuring the published CLI package, not about development/contributing workflows.
