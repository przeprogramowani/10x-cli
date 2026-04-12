# 10x-cli

CLI tool for [10xDevs](https://10xdevs.pl) course content. Fetch and apply AI coding skills,
prompts, and configs directly into your workspace.

## Install

```bash
# npm (recommended)
npm install -g @przeprogramowani/10x-cli

# Or download a standalone binary from GitHub Releases
# https://github.com/przeprogramowani/10x-cli/releases
```

## Quick Start

```bash
10x auth        # Authenticate with your email
10x list        # Browse available modules and lessons
10x get m1l1    # Fetch and apply lesson artifacts
10x doctor      # Check everything is working
```

## Commands

| Command | Description |
|---------|-------------|
| `10x auth` | Magic-link login with your Circle-registered email |
| `10x list` | Browse modules and lessons in your course |
| `10x get <ref>` | Fetch a lesson and apply artifacts to `.claude/` |
| `10x doctor` | Diagnose auth, API connectivity, and local config |

### Global Flags

- `--json` — Machine-readable JSON output (auto-detected when piped)
- `--verbose` — Request/response diagnostics on stderr
- `--version` — Print CLI version
- `--help` — Show help

### Lesson References

Lessons are referenced by module and lesson number:

- `m1l1` — Module 1, Lesson 1
- `m2l3` — Module 2, Lesson 3

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
