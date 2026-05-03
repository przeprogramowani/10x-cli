# Changelog

All notable changes to `@przeprogramowani/10x-cli` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-03

### Breaking changes

This release upgrades to the directory-shaped skill bundle defined by the
delivery API at `@przeprogramowani/10x-toolkit`. **CLIs older than 1.0.0 cannot
parse bundles produced after the API deploy**, and 1.0.0 cannot consume the
old bundle shape. Both repos must roll forward together.

- **Skill bundles ship as full directories.** A skill is now `{ name, files: [{ path, content, executable? }] }`
  rather than `{ name, content }`. Every file under the skill directory in
  `@przeprogramowani/ai-artifacts` (e.g. `scripts/`, `references/`) materializes
  on disk with its executable bit preserved when set. Running `10x get m1l1`
  now writes `.claude/skills/<name>/SKILL.md`, `.claude/skills/<name>/scripts/check-context.sh`
  (with `+x`), and any other files under the source skill directory.
- **`ArtifactResponse` is a discriminated union.** `/api/artifacts/.../skills/:name`
  returns `{ type: "skills", name, files, universalContent? }`; prompts/rules/configs
  still return `{ type, name, content }`. Code reading `result.data.content` for
  skills will not type-check.
- **Manifest schema bumped to v2.** `files.skills` is now a record keyed by
  skill name → `{ files: string[] }` (relative paths under the skill dir).
  v1 manifests (skills as `string[]`) are read as `null` — treated as
  no-prior-state for one cleanup cycle, then the v2 manifest takes over on
  the next apply. No migration script.

### Added

- **Per-file removal within a retained skill.** When upstream drops a file from
  an existing skill, `10x get` removes the local copy and prunes the now-empty
  parent directory; the skill directory itself stays put for subsequent applies.
- **Path-traversal guard for skill files.** `assertSafeSkillFilePath` rejects
  empty paths, absolute paths, drive prefixes, `..` segments, backslash
  separators, and Windows-reserved names (CON/PRN/...). The writer aborts
  before any filesystem mutation when a bundle is tampered.
- **Print-mode notice for multi-file skills.** `10x get ... --print --type skills [--name X]`
  emits SKILL.md to stdout (so redirects like `> /tmp/SKILL.md` capture only
  that), and writes `Note: skill "<name>" has N additional files not shown in
  --print: ...\nRun without --print to materialize all files.` to stderr.
  JSON mode is unchanged; the full `files[]` array is in the response.
- **Per-file actions in `WriteResult.skills`.** `result.skills[i]` is now
  `{ name, files: [{ path, absolutePath, action }] }` instead of `{ name, path, action }`.
  The `--json` output reflects the same shape; consumers reading per-skill
  status need to walk the `files` array.

### Changed

- **`ToolProfile.skillDir(name)`** is a new required field on every profile,
  returning the skill directory path (without the `/SKILL.md` suffix). The
  existing `skillPath(name)` is unchanged for callers that need the SKILL.md
  file specifically.
- **`tool-switch` migration walks every file under each skill directory** —
  `migrateArtifacts` and `deleteArtifacts` no longer assume a single file
  per skill.

### Removed

- Nothing student-facing was removed. Old `ArtifactWrite { name, path, action }`
  entries in `WriteResult.skills` are replaced by the per-file `SkillWrite`
  shape described above.
