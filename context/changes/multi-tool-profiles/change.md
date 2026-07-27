---
id: multi-tool-profiles
title: Multiple active coding-tool profiles
status: planned
created: 2026-07-27
updated: 2026-07-27
archived_at: null
source_issue: https://github.com/przeprogramowani/10x-cli/issues/3
---

# Multiple active coding-tool profiles

Allow one `10x get` or `10x sync` run to materialize the same course artifacts
for several coding tools while preserving a single default tool and backward
compatibility with existing `config.json` files.

## Intent

- Keep `tool` as the default profile used by single-target flows.
- Add an explicit set of active targets.
- Let a user add tools on a later invocation without treating active peers as
  orphaned artifacts.
- Make the result visible and testable for Claude Code, Codex and Cursor.

## Non-goals

- Changing the remote artifact schema.
- Deduplicating identical files across tool directories.
- Removing support for the existing single-value `--tool` flag.
- Changing authentication, language selection or course-rules semantics.
