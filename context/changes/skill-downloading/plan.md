# Skill & Skill-Group Install Implementation Plan

## Overview

Learners can install one skill, or a named group, into a project without knowing which lesson delivers it:

- `10x skill <name>`: unchanged overview. `--install` writes the skill.
- `10x skill-group <name>`: the group's summary and its ordered members. `--install` writes every member.

The first group is `core-skill-chain`: 10x-frame, 10x-research, 10x-plan, 10x-plan-review, 10x-implement, 10x-impl-review. Installs reuse the writer's conflict, hash, containment and safe-removal guarantees. Older CLIs keep working on the same project.

Counterpart: `context/changes/skill-downloading/plan.md` in przeprogramowani/10x-toolkit (phases T1–T3). It adds:

- `GET /api/skills/{name}`
- `GET /api/skill-groups`
- `GET /api/skill-groups/{group}/skills`

## Current State Analysis

- **Writing a skill today** needs a lesson: `10x get <lesson> --type skills --name X`. `10x helpers install` writes only the two bundled helpers.
- **`10x skill <name>`** (`src/commands/skill.ts`) is read-only. It already has name normalization, typo suggestions and `resolveCourseScope()`. It detects a missing route in `fetchSkillOverviews` (`src/lib/api-content.ts:139-151`): a 404 whose code isn't `course_not_found` becomes `skill_overviews_unsupported`, exit 1.
- **Ownership** is `manifest.lessons: Record<string, LessonFilesEntry>`, and `files` is the union of all entries (`src/lib/manifest.ts:254-290`). Manifest keys are never validated (`isLessonsRecord`, `manifest.ts:245-252`). The `mNlN` format is enforced only for user input (`src/lib/lesson-ref.ts:30-42`).
- **`applyBundle`** (`src/lib/writer.ts:223+`):
  - asserts and establishes the project course (`:271`);
  - sets top-level `ledger.lessonId = bundle.lessonId` (`:389`);
  - records `representation` with `courseRules: applyCourseRules` only after a conflict-free apply (`:391-396`);
  - invalidates other owners' freshness whenever a shared file's hash changes, unless `isEarlierLesson` (`:250-269`, `:504-510`), which is always false for keys that aren't `mNlN`.
- **Rules:** with empty `bundle.rules`, `applyCourseRules: true` is a no-op. `false` strips the block and invalidates every lesson's freshness.
- **`prepareToolForWrite`** (`src/lib/tool-prompt.ts:104-115`) also establishes `.10x-cli.json`.
- **What older CLIs do with these files:**
  - `isManifest` requires a string `course` and `lessonId` (`manifest.ts:177-205`).
  - `.10x-cli.json` must be exactly `{ version: 1, course }` (`src/lib/project-course.ts:67-68`).
  - `sync` acts only on catalog lesson IDs (`src/commands/sync.ts:177-182`).
  - `managed-rules.ts:25` treats any entry without `representation.courseRules === false` as owning the course rules block.
  - `changelog` takes the newest `appliedAt` across entries as its fallback baseline (`src/commands/changelog.ts:186-196`).

## Desired End State

- `10x skill 10x-plan --install` and `10x skill-group core-skill-chain --install` write the skills for the project's tool and language, with interactive conflict handling in a TTY and skip otherwise.
- `--dry-run` previews the changes. Piped output is a JSON envelope with a per-skill result.
- Re-running the command updates skills that weren't modified locally. When the group drops a member, the next install removes it only if the safe-removal checks allow it.
- No `.10x-cli.json` is created or changed. The manifest stays readable by older CLIs, they keep protecting the files, and their `sync` ignores the standalone entries.

### Key Discoveries:

- **Reserved keys work for every manifest-v3 CLI.** Keys like `skill:<name>` / `group:<id>` inside `lessons` are accepted, included in the file union, kept by tool switch (`src/lib/tool-switch.ts:32-58`), and ignored by `sync`. `:` never reaches a path: `lessonId` is used only in API URLs, and those must never receive the key.
- **Shared files would bounce between owners.** If a standalone entry rewrites a lesson-owned file with different bytes, each write invalidates the other entry and the next `sync` writes the lesson's bytes back. Generated variants can differ between lessons (toolkit research), so this is real.
- **Standalone entries need `representation` in every case**, even after conflicts. Without it, both old and new rules logic treat the entry as owning the course rules block.
- **Course resolution for writing** needs a concrete course for `ApplyOptions.course`. `resolveCourseScope` can return none, and the server picks a course when there's no hint, so the response's course is the one to use.

## What We're NOT Doing

- Signing in without a course, licenses, latest-from-master content.
- `sync` refreshing standalone entries. Re-running `--install` updates them.
- `--force`. Conflicts are resolved interactively or skipped, like `get`.
- A list mode: both commands require a name. Unknown names get suggestions.
- Uninstall or removal commands for standalone entries.
- Any change to existing flags, outputs, exit codes, the manifest schema version, or `.10x-cli.json`.

## Implementation Approach

1. Fetch from the new routes, verifying the signature and release identity the same way as `fetchArtifact`.
2. Wrap the response into a skills-only bundle whose `lessonId` is a reserved owner key.
3. Apply it through the unchanged plan/apply pipeline with a `standalone` mode. That mode turns off project binding and `lessonId`/digest bookkeeping, always records a representation that doesn't claim rules, and **defers to lesson owners**.
4. Exclude standalone entries from lesson-centric readers.

## Critical Implementation Details

- **Deferring to lesson owners.** In standalone mode, a skill that any lesson entry already owns isn't written. Its files are recorded as co-owned by the standalone entry, so a later lesson removal can't delete them. The skill is reported as `managed_by_lesson` with the lesson ID, and no other owner is invalidated. Lesson writes over standalone-owned files proceed as today: the lesson wins and nothing bounces.
- **Merge order.** Phase 1's generated types must reach CLI master before the toolkit PR merges, because the toolkit's coordinated check validates against them. Phases 2–5 may ship before the toolkit deploys. The commands then exit 1 with `skill_install_unsupported` / `skill_groups_unsupported`.

## Phase 1: Types and Fetchers

### Overview

Typed and verified access to the three new routes.

### Changes Required:

#### 1. Generated types

**File**: `src/generated/api-types.ts`

**Intent**: Regenerate against the toolkit branch worker (`API_BASE_URL=http://localhost:8787 bun run generate-types`). Additions only.

**Contract**: New `paths` entries for `/api/skills/{name}`, `/api/skill-groups` and `/api/skill-groups/{group}/skills`.

#### 2. Fetchers

**File**: `src/lib/api-content.ts`

**Intent**: Mirror `fetchArtifact` (signature, `releaseMismatch`) and `fetchSkillOverviews` (missing-route mapping).

**Contract**:

- `fetchSkill(name, { course?, tool, lang, release? }, token)`
- `fetchSkillGroups({ course?, lang }, token)`
- `fetchSkillGroupSkills(group, { course?, tool, lang, release? }, token)`
- Each has a validator.
- A 404 whose code isn't `skill_not_found`, `skill_group_not_found` or `course_not_found` maps to `skill_install_unsupported` (for skills and group skills) or `skill_groups_unsupported` (for the group list).
- Add human messages for these codes and `skill_group_incomplete` to the message table in `src/lib/api-client.ts`.

### Success Criteria:

#### Automated Verification:

- Fetcher tests cover a valid payload, a bad signature, a release mismatch, the unsupported-route 404, a real `skill_not_found` 404 and a malformed body.
- `bun run typecheck` and `bun run lint` pass.

#### Manual Verification:

- The generated-types diff contains only additions.

**Implementation Note**: Merge this phase to master before the toolkit PR merges.

---

## Phase 2: Standalone Owners in the Writer

### Overview

Writer and manifest support for entries that aren't lessons.

### Changes Required:

#### 1. Owner keys

**File**: `src/lib/manifest.ts`

**Intent**: One definition of the reserved keys and the predicate everyone uses.

**Contract**: `skillOwnerKey(name)` gives `skill:<name>` and `groupOwnerKey(id)` gives `group:<id>`. `isStandaloneOwner(key)`. No manifest version bump.

#### 2. Standalone apply mode

**Files**: `src/lib/writer.ts`, `src/lib/tool-prompt.ts`

**Intent**: Apply a skills-only bundle under an owner key without the side effects of a lesson apply.

**Contract**: `ApplyOptions.standalone?: true` (also accepted by `planBundle`).

- **Project binding:** never calls `establishProjectCourse`. If the project is bound, `assertProjectCourse` still requires the same course. `prepareToolForWrite` gets a `bindProject: false` option for the same purpose.
- **Manifest top-level fields:**
  - top-level `lessonId` keeps its previous value; a fresh manifest uses the owner key;
  - `course` keeps the existing manifest's value, or otherwise uses the response's course;
  - neither `catalogContentHash` nor the installed release fields are written for the entry.
- **Representation:** always recorded on the entry, conflicts or not, as `{ lang, tool, courseRules: false, rules: false }`.
- **Rules:** applied with `applyCourseRules: true` and empty rules, so the rules file is left alone.
- **Lesson-owned skills:** deferred as described above, with a new plan/write action `managed_by_lesson` that carries `ownerLessonId`. The `planBundle`/`applyBundle` parity covers it.
- **Partial vs non-partial:** a single skill is applied partial. A group is applied non-partial, so removals are scoped to the group key and go through the existing safe-removal checks.

#### 3. Lesson-centric readers

**Files**: `src/commands/changelog.ts`, `src/commands/sync.ts`, `src/lib/sync-freshness.ts`

**Intent**: Standalone entries are never treated as lessons.

**Contract**:

- `newestAppliedAt` skips standalone keys.
- `sync` and freshness skip standalone keys explicitly, not only because the catalog doesn't contain them.
- `renderGetResult` and lesson URLs never receive an owner key.

### Success Criteria:

#### Automated Verification:

- Writer tests cover:
  - a fresh project, where no `.10x-cli.json` is created and the manifest passes `isManifest`;
  - a project bound to the same course, and `course_mismatch` for another course;
  - a non-TTY conflict being skipped, with the representation still recorded;
  - a lesson-owned skill deferred: not written, co-owned, `managed_by_lesson`, the lesson's freshness intact;
  - a later lesson write over a standalone-owned file;
  - a group shrinking: an unmodified member removed, an edited member kept, a lesson-owned member kept;
  - `lessonId` preserved;
  - the rules file and `managedRules` untouched;
  - `otherRulesOwners` not counting a standalone entry.
- `tests/writer-plan.test.ts` parity passes, including `managed_by_lesson`.
- `changelog` and `sync` tests prove standalone keys are ignored.
- `bun run quality:affected --base <branch base>` passes.

#### Manual Verification:

- A manifest produced by these tests opens cleanly in the previous published CLI (`doctor`, `sync --dry-run`). This is repeated end to end in Phase 5.

**Implementation Note**: Pause for manual confirmation after this phase.

---

## Phase 3: `10x skill <name> --install`

### Overview

Single-skill install on the existing command.

### Changes Required:

#### 1. Shared install flow

**File**: `src/lib/skill-install.ts` (new)

**Intent**: One flow for both commands:

1. validate;
2. require auth;
3. resolve the tool;
4. send the course hint: `--course`, else the project binding, else none;
5. fetch;
6. wrap the response into a bundle;
7. plan, then apply with `standalone` and `createConflictResolver(tty && !dryRun)`;
8. render.

**Contract**: `installStandalone(ctx, { kind: "skill" | "group", name, flags })` returns the aggregate result. Tool resolution is the same as `get` (flag, then config, then detection or prompt), without binding.

#### 2. Command flags

**File**: `src/commands/skill.ts`

**Intent**: Add the install mode without changing the overview mode.

**Contract**:

- New flags: `--install`, `--dry-run`, `--tool`, `--lang` (`--course` already exists).
- `--dry-run` or `--tool` without `--install` exits 2 (USAGE).
- JSON output: `{ skill, course, grantedBy, sourceLessonId, result }`. Human mode prints a short per-file summary to stderr.
- Exit codes:
  - an unknown skill exits 5, with best-effort suggestions from overviews;
  - a denied course exits 4;
  - a missing route exits 1 (`skill_install_unsupported`).

### Success Criteria:

#### Automated Verification:

- Command tests cover install, re-install giving "unchanged", dry-run, JSON envelope, a non-TTY conflict skipped, a lesson-owned skill deferred, an unknown skill with suggestions, a denied course, the unsupported route, and usage errors.
- Existing `tests/skill-command.test.ts` passes unchanged.

#### Manual Verification:

- Against the local toolkit worker, `10x skill 10x-plan --install` in a fresh project writes the skill for claude-code and for codex.

**Implementation Note**: Pause for manual confirmation after this phase.

---

## Phase 4: `10x skill-group <name> [--install]`

### Overview

The group command: overview and install.

### Changes Required:

#### 1. Command

**Files**: `src/commands/skill-group.ts` (new), `src/index.ts`

**Intent**: Docs by default, install with `--install`, reusing `skill-install.ts` and the rendering helpers in `skill.ts`.

**Contract**:

- **Overview:** `fetchSkillGroups`, plus each member's problem line from `fetchSkillOverviews` (best effort; the member names alone are enough). Text is sanitized, then wrapped, then styled. An unknown group exits 5 with suggestions from the list. JSON output: `{ course, group }`.
- **`--install`:** `fetchSkillGroupSkills`, owner key `group:<id>`, one aggregate report with an outcome per skill. Same flags and exit codes as Phase 3.

### Success Criteria:

#### Automated Verification:

- Command tests cover the overview (both languages), install, re-install, a member removed upstream, a lesson-owned member deferred, JSON output, an unknown group and the unsupported route.
- `bun run quality:fast` passes.

#### Manual Verification:

- `10x skill-group core-skill-chain` reads well in an 80-column terminal, and `--install` writes all six skills.

**Implementation Note**: Pause for manual confirmation after this phase.

---

## Phase 5: Docs and Verification

### Overview

User docs, agent guide and end-to-end proof, including an older CLI.

### Changes Required:

#### 1. Docs

**Files**: `README.md`, `skills/10x-cli-guide/SKILL.md`, `CHANGELOG.md`, `CLAUDE.md`

**Intent**:

- Document both commands.
- In `CLAUDE.md`, add a short "standalone owners" note under the cumulative-manifest section covering the reserved keys, deferral, no binding, and representation always recorded.

**Contract**: New sections only. Existing command docs unchanged.

#### 2. Verify skill

**Files**: `.claude/skills/verify-10x-cli/scripts/fake-api.ts`, `.claude/skills/verify-10x-cli/features/skill-install.md` (new), `features/README.md`

**Intent**: Fake routes plus a feature script that drives the real CLI.

**Contract**: The fake API serves the three routes with signed payloads, using the same signing approach as its existing artifact route.

### Success Criteria:

#### Automated Verification:

- `bun run quality:gate` passes.

#### Manual Verification:

- verify-10x-cli `skill-install` run in a fresh project (claude-code and codex):
  - install `10x-plan`, then `core-skill-chain`;
  - re-run to get "unchanged";
  - edit a file and re-run to get "conflict skipped";
  - apply a lesson, then re-install the group to get `managed_by_lesson`.
- In that same project, the **previous published CLI** runs `doctor`, `sync --dry-run` and `get <lesson>`: it reads the manifest, keeps the standalone files, and exits normally.

---

## Testing Strategy

### Unit Tests:

- Owner-key helpers, fetch validators, missing-route mapping.
- Writer standalone mode: deferral, representation, binding, `lessonId`, rules, group shrink.

### Integration Tests:

- Command tests with the API-content mock for both commands, TTY and non-TTY.
- Plan/apply parity, including `managed_by_lesson`.

### Manual Testing Steps:

1. Start the local toolkit worker with the T3 seed.
2. Run the verify-10x-cli `skill-install` feature.
3. Run the previous CLI release on the same project.

## Performance Considerations

- One request per install (plus a best-effort overviews call for suggestions or member lines). No extra manifest reads beyond `get`.

## Migration Notes

- None. Existing manifests need no migration. Standalone entries are additive keys inside schema 3.

## References

- Toolkit counterpart plan: 10x-toolkit `context/changes/skill-downloading/plan.md`
- Prior change: `context/changes/skill-command/`
- Patterns: `src/commands/get.ts` (filtered skill apply, tool resolution), `src/commands/skill.ts`, `src/lib/api-content.ts` (`fetchArtifact`, `fetchSkillOverviews`), `src/lib/writer.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Types and Fetchers

#### Automated

- [x] 1.1 Fetcher tests cover a valid payload, a bad signature, a release mismatch, the unsupported-route 404, a real `skill_not_found` 404 and a malformed body. — 72cbf14
- [x] 1.2 `bun run typecheck` and `bun run lint` pass. — 72cbf14

#### Manual

- [ ] 1.3 The generated-types diff contains only additions.

### Phase 2: Standalone Owners in the Writer

#### Automated

- [x] 2.1 Writer tests cover all standalone cases listed in Phase 2. — f93104f
- [x] 2.2 `tests/writer-plan.test.ts` parity passes, including `managed_by_lesson`. — f93104f
- [x] 2.3 `changelog` and `sync` tests prove standalone keys are ignored. — f93104f
- [x] 2.4 `bun run quality:affected --base <branch base>` passes. — f93104f

#### Manual

- [ ] 2.5 A manifest produced by these tests opens cleanly in the previous published CLI (`doctor`, `sync --dry-run`).

### Phase 3: `10x skill <name> --install`

#### Automated

- [x] 3.1 Command tests cover all install cases listed in Phase 3. — 0a63f97
- [x] 3.2 Existing `tests/skill-command.test.ts` passes unchanged. — 0a63f97

#### Manual

- [ ] 3.3 Against the local toolkit worker, `10x skill 10x-plan --install` in a fresh project writes the skill for claude-code and for codex.

### Phase 4: `10x skill-group <name> [--install]`

#### Automated

- [x] 4.1 Command tests cover all group cases listed in Phase 4. — 0f0eb66
- [x] 4.2 `bun run quality:fast` passes. — 0f0eb66

#### Manual

- [ ] 4.3 `10x skill-group core-skill-chain` reads well in an 80-column terminal, and `--install` writes all six skills.

### Phase 5: Docs and Verification

#### Automated

- [x] 5.1 `bun run quality:gate` passes.

#### Manual

- [ ] 5.2 verify-10x-cli `skill-install` run in a fresh project (claude-code and codex), covering every case listed in Phase 5.
- [ ] 5.3 In that same project, the previous published CLI runs `doctor`, `sync --dry-run` and `get <lesson>`: it reads the manifest, keeps the standalone files, and exits normally.
