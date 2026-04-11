# @przeprogramowani/10x-cli

Open-source CLI for [10xDevs](https://10xdevs.pl) course content. Authenticate with your Circle-registered email, fetch lesson packs, and auto-apply skills, prompts, rules, and configs to `.claude/`.

> **Status:** Early scaffold. Commands are stubs — full implementation lands in Phases 3–6 of the [design plan](../10x-toolkit/thoughts/shared/plans/2026-04-07-10x-cli-design.md).

## Install

```bash
# npm global (Phase 6)
npm i -g @przeprogramowani/10x-cli

# or standalone binary (Phase 6)
curl -fsSL https://10xdevs.pl/cli/install.sh | sh
```

## Usage

```bash
10x auth            # magic-link login
10x list            # browse modules/lessons
10x get <ref>       # fetch + apply a lesson to .claude/
10x doctor          # diagnose auth, API, config, .claude/
```

Global flags:

- `--json` — machine-readable output (auto-detected when piped)
- `--verbose` — request/response diagnostics on stderr

## Development

```bash
bun install
bun run generate-types     # fetch /openapi.json → src/generated/api-types.ts
bun run dev -- --help       # run CLI via source
bun run build               # produce dist/index.mjs
bun run build:binary        # produce standalone ~59MB binary
bun test                    # vitest
bun run typecheck
bun run lint
```

The CLI targets the 10x-toolkit delivery API at `10x-toolkit-api.przeprogramowani.workers.dev`. Override via `API_BASE_URL` env var in development.

## License

MIT
