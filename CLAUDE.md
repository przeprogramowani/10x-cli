# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early scaffold for the `@przeprogramowani/10x-cli`. Most commands are deliberate stubs that exit via `exitNotImplemented` and reference the phase in which they land. The full roadmap lives at `thoughts/shared/plans/2026-04-07-10x-cli-design.md` (in the sibling `10x-toolkit` repo, not in this one). When asked to implement something, check that plan first to understand which phase the work belongs to and what envelope/exit-code conventions apply.

## Commands

Runtime is **Bun** (≥ Node 20 declared in `package.json` for the published binary, but local dev uses Bun directly).

```bash
bun install
bun run dev -- <args>      # run CLI from source, e.g. `bun run dev -- --help`
bun run typecheck          # tsc --noEmit
bun run lint               # oxlint (config in .oxlintrc.json)
bun test                   # bun:test runner; tests live in tests/
bun test tests/smoke.test.ts   # single file
bun run build              # node-target ESM bundle → dist/index.mjs
bun run build:binary       # standalone compiled binary → dist/10x (~59MB)
bun run generate-types     # refetch /openapi.json → src/generated/api-types.ts
```

`generate-types` hits the production delivery API by default. To regenerate against a local backend: `API_BASE_URL=http://localhost:8787 bun run generate-types`. The same env var is read at CLI runtime by `resolveApiBase()` to point the CLI at a non-production API. **The allowlist is strict**: only the exact production host or `http://localhost` / `http://127.0.0.1` (any port) are accepted — any other URL throws and exits 2. If you need a staging host, add it explicitly to `PROD_HOSTNAME` / `DEV_HOSTNAMES` in `src/lib/api-client.ts`.

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build → build:binary on every PR. Anything that breaks one of those steps will block merge.

## Architecture

The CLI is a thin **CAC**-based command dispatcher (`src/index.ts`) that wires command modules into a single `cac("10x")` instance and parses argv. Three concerns are factored into `src/lib/`:

- **`api-client.ts`** — typed `fetch` wrapper for the 10x-toolkit delivery API. Returns a discriminated `ApiResult<T>` (`{ ok: true, data }` | `{ ok: false, code, error }`) — callers **must** branch on `ok` and surface failures via `outputError`. Network errors collapse to `code: "network_error"`, status `0`. The HTTP surface is described by `src/generated/api-types.ts`, which is generated from `/openapi.json` and committed to git; never hand-edit it.
- **`config.ts`** — XDG-compliant local credential store at `$XDG_CONFIG_HOME/10x-cli/auth.json` (Windows: `%APPDATA%/10x-cli/auth.json`). `saveAuth` writes atomically via `tmp` + `renameSync` with mode `0o600`, and `AuthData` is versioned (`AUTH_FILE_VERSION = 1`) — bumping the schema means bumping the version and handling the older payload in `readAuth`.
- **`output.ts`** — the I/O contract every command must follow. Three rules to internalize:
  1. **Stdout is reserved for data; humans read stderr.** `output()` writes JSON to stdout *or* a human message to stderr — never both.
  2. **JSON mode is implied when stdout is not a TTY**, even without `--json`. `resolveContext()` handles this; commands should always go through it instead of checking flags directly.
  3. **Exit codes are semantic** (`ExitCodes`): `0` SUCCESS, `1` ERROR, `2` USAGE, `3` AUTH_REQUIRED, `4` FORBIDDEN, `5` NOT_FOUND. Use `outputError(ctx, code, message, exitCode, hint)` rather than `process.exit` ad-hoc, so the JSON envelope `{ status: "error", error: { code, message, hint } }` stays consistent.

- **`conflict-prompt.ts`** — interactive conflict resolution for user-edited files. `createConflictResolver(tty)` returns a `ConflictResolver` callback injected into `applyBundle()`. TTY mode shows a per-file `@clack/prompts` select with overwrite / save-as-.user / skip / apply-to-all options. Non-TTY mode returns `"skip"` unconditionally — user work is never silently destroyed in pipelines.

Each command in `src/commands/` exports a `register*Command(cli)` function that attaches itself to the shared CAC instance. Adding a new command means: create `src/commands/foo.ts` exporting `registerFooCommand`, import + call it in `src/index.ts`. Action callbacks receive their positional args followed by an options object that already includes the global `--json` / `--verbose` flags — pass that object straight into `resolveContext` / `outputError`.

Stub commands intentionally call `exitNotImplemented(name, phase, options)` so machine consumers still get a parseable error envelope. When implementing a phase, replace that call rather than working around it.

## Testing

- Test runner: `bun test` (not vitest, not Jest)
- Imports: `import { describe, it, expect, mock } from "bun:test"`
- Module mocks: use `mock.module()` from `bun:test`, not `vi.mock`
- Prefer dependency injection over module mocking where possible
- Run tests with `bun test`, not `vitest run` or `npx jest`

## Writer & conflict detection

`applyBundle()` in `writer.ts` is **async** and accepts an optional `onConflict: ConflictResolver` callback via `ApplyOptions`. The writer uses three-way hash comparison to detect user-edited files:

- The manifest (v3) stores per-file SHA-256 content hashes (`contentHashes` for skills, `promptHashes` for prompts).
- On re-apply, if local content differs from both the stored hash and the new bundle content, it's a user edit → the `onConflict` callback is invoked.
- If local content differs from the stored hash but matches the new content → `"unchanged"` (no conflict).
- If local content matches the stored hash → clean upstream update, no conflict.
- When no `onConflict` callback is provided, conflicts default to `"skip"` (safe).
- Manifest v2 (no hashes) is accepted at read time; any content difference on first apply triggers a conflict prompt (one-time calibration). After resolution, v3 hashes are stored.

`WriteResult.removals` reports each stale tracked file as `removed`, `preserved_local` with a reason, or `unchanged` when already missing. `counts.removals` counts actual removals only. Shared `managed-removal.ts` permits deletion only for regular files whose stored upstream hash matches current bytes and which have no remaining owner. Preserve untracked files, modified files, legacy files without hashes, and config templates; prune only empty directories. Neither recursive deletion nor `--force` may bypass these checks. Validate all path components with `lstat` and project containment before writes, removals, or transfers; reject symlinks, traversal, and nonregular targets.

Conflict actions: `"conflict_overwritten"` | `"conflict_saved_user"` (creates a `.user.<ext>` backup, choosing a numbered name when needed) | `"conflict_skipped"` (preserves local and the previous upstream hash so the conflict remains detectable). Successful file writes persist their own ownership and hashes incrementally, including filtered updates; unrelated ownership is retained. Incomplete or conflicted lesson applications cannot establish a fresh representation or release identity.

`applyBundle` takes `applyCourseRules?: boolean` (default `true`). The CLI resolves it as argv flag > persisted `courseRules` preference > default-on; `resolveCourseRulesFlag` distinguishes CAC's implicit positive flag from an explicit one. `--type rules` requests rule delivery regardless of that preference, while still enforcing conflict protection.

Compatible manifest schema 3 stores optional `managedRules` metadata: physical path, sentinel pair, and the last successfully delivered upstream block hash. `managed-rules.ts` compares both preview and apply against that baseline. Modified or unknown-baseline blocks require an explicit conflict choice before replacement or removal, including opt-out and `--force`. Never infer a trusted baseline from arbitrary local bytes, even if an untracked block matches the requested content. Preserve the old baseline when retaining local edits; update it only after successful delivery. Interactive `get` reuses the per-file resolver and backup behavior; noninteractive `sync --force` still preserves rule conflicts.

Rules sharing a physical file consult every current and legacy profile. Incompatible owners block replacement; opting out releases only this profile's claim and keeps any still-owned block. Sentinel updates/removals preserve all outside bytes, including whitespace. Malformed, duplicate, or orphan markers require repair before writes; never truncate them automatically. Older CLI versions can read the additive metadata, but do not enforce these protections.

## Cumulative manifest & lesson-scoped removal

The manifest is **cumulative** — each `10x get` accumulates artifacts across lessons instead of replacing them. The manifest's `lessons` field (`Record<string, LessonFilesEntry>`) tracks per-lesson file ownership:

- Each lesson entry records its skills, prompts, configs, and an `appliedAt` timestamp. A complete successful apply also records language/tool/rules representation and, when supplied by the verified bundle, installed release ID and manifest hash.
- The `files` field is a **union** of lesson ownership, rebuilt through `rebuildManifestFiles()`. Hashes record the last installed upstream baseline, which may differ from locally edited bytes. Successful writes update hashes; preserved conflicts retain their old baseline. Retiring ownership also removes stale hashes, so preserved local orphans become unmanaged and cannot be swept later.
- `computeRemovals()` is **scoped to the current lesson**: it considers only previously owned files absent from the new bundle. Another lesson's ownership protects the physical file. The shared removal helper then enforces the hash, file-type, and config-preservation checks above; a failed removal retains ownership.
- `lessonId` is the last-applied lesson (for display/backward compat). `Object.keys(manifest.lessons)` gives all applied lesson IDs.
- Upgrading from v2 or v3-without-`lessons` seeds the `lessons` record from the previous manifest's `lessonId` + `files` data so existing artifacts aren't orphaned.

Profile migration preserves course and both ownership ledgers. It copies to the destination, records successful destination ownership, then removes and retires source ownership. Skipped or failed transfers retain their source claims; do not delete the source manifest until all ownership is transferred or retired. Existing destination content, shared rules, and unknown baselines receive the same protection as ordinary updates.

## `10x sync` & change detection

`commands/sync.ts` is the bulk download + update command. It enumerates unlocked lessons in one `fetchCatalog` call, applies each via `applyBundle`, and emits one aggregate report — it **never `process.exit`s mid-loop** (per-lesson failures accumulate; exit code is worst-outcome, `1` only if a lesson errored) and **never prompts**. The default resolver skips conflicts. `--force` permits replacement of edited skills/prompts, but never bypasses managed-rule conflict or safe-removal checks.

- **Cheap-skip requires digest, representation, and local state to agree.** Compare the catalog's per-lesson `contentHash` to `manifest.lessons[id].catalogContentHash`, then use `isLessonFresh()` to verify the requested language/tool/rules representation and actual tracked bytes against stored baselines. Never compare catalog digests with per-file hashes; they occupy different hash spaces. Missing files trigger repair, local edits remain conflicts, and absent metadata forces a conservative refetch. Representation changes and partial/conflicted applies invalidate the shortcut; `--force` also bypasses it.
- **`planBundle()` is the pure planner.** It classifies per-file `{ action, isConflict, upstreamChanged }` without writing or prompting; `applyBundle` consumes it so classification and application can't diverge. `sync --dry-run` reports off `planBundle`; the real path reports off `applyBundle`'s `WriteResult`. The parity is locked by `tests/writer-plan.test.ts`.
- Reports include skill/prompt changes, managed-rule conflicts, config outcomes, removals, and preserved local files with reasons. Configs remain create-only; existing templates are not adopted or assigned a hash inferred from their local content.
- A complete, conflict-free `get` may retain an existing catalog digest for the same language/tool representation. Filtered or conflicted updates invalidate it. When a shared artifact changes, invalidate other affected lessons' representation metadata as well.

## Conventions worth knowing

- TypeScript is `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Index access on arrays/records returns `T | undefined` — handle it.
- Generated code lives under `src/generated/` and is excluded from oxlint via `.oxlintrc.json`.
- The CAC parser throws on unknown options; `src/index.ts` catches that and exits `2` (USAGE) with an `ERROR usage:` prefix on stderr. Preserve this behavior — it's how scripts detect bad invocations.
- The CLI's user-agent is hard-coded to `"10x-cli"` in `api-client.ts`.
