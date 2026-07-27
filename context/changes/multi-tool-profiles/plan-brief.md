# Multi-tool profiles — plan brief

> Research: `context/changes/multi-tool-profiles/research.md`

## What and why

Users commonly work with several AI coding tools, while `10x-cli` currently
persists and materializes artifacts for only one. The change adds multiple
active targets without removing the existing default-tool contract.

## Architecture

```text
config: default tool + ordered active tools
                  ↓
          resolveToolProfiles
             ↙    ↓    ↘
        Claude  Codex  Cursor
             ↘    ↓    ↙
        separate fetch + apply + manifest
```

## Phases

1. Configuration schema and resolver.
2. Multi-target `get`.
3. Multi-target `sync` and full regression verification.

## Success

One command writes a lesson bundle to at least Claude Code, Codex and Cursor,
old configuration remains valid, and the full CI-equivalent suite passes.
