# `10x skill <name>` Implementation Plan

> Reverse-documented: written after the implementation landed (PR #88, cc0e820). Phases mirror the work; Progress records what was verified.

## Overview

A read-only command that prints one skill's entry from the toolkit's `GET /api/skill-overviews`: stage, problem, solution, when to use, artifacts and up to three related skills, in English or Polish. A terminal glossary, so the output stays short.

## Current State Analysis

- `10x changelog` already shows remote, toolkit-generated text: course scope via the project manifest, `api-content.ts` fetch + validation, sanitized and wrapped output, semantic exit codes.
- The 10x-hub skill glossary (`przeprogramowani-sites`) sets the tone: name, one tight sentence, chain position, artifact.
- `src/generated/api-types.ts` is generated from the toolkit's OpenAPI and never hand-edited.

## Desired End State

- `10x skill 10x-plan`, `10x skill /10x-plan --lang pl`, `10x skill plan --course 10xdevs-4` print a compact entry; piped output is `{ course, overview }`.
- A typo suggests close names; failures use the standard envelope and exit codes.
- Verify: `tests/skill-command.test.ts`, full suite, and the real CLI against a local toolkit worker.

### Key Discoveries:

- `resolveCourseScope()` in `src/commands/changelog.ts` already picks the project's course, else the account's grants; export and reuse it.
- The route returns the whole course-scoped list, so suggestions can be computed locally with no extra endpoint.
- Learners type skills as `/10x-plan` (Claude Code) or `$10x-plan` (Codex), or bare `plan`.

## What We're NOT Doing

- No local cache of overviews.
- No listing mode (`10x skill` without a name prints usage).
- No text generation in the CLI: all text comes from the toolkit.

## Implementation Approach

Follow `changelog`: a `register*Command` module, a typed fetch + validator in `api-content.ts`, rendering through `output.ts`, remote text sanitized before printing and wrapped before styling.

## Phase 1: API Client and Types

### Overview

Typed access to the new route.

### Changes Required:

#### 1. Generated types

**File**: `src/generated/api-types.ts`

**Intent**: Regenerated from the toolkit branch's worker; additions only.

#### 2. Fetch and validation

**File**: `src/lib/api-content.ts`

**Intent**: `fetchSkillOverviews(course, lang)` and `validateSkillOverviewsResponse`, rejecting malformed payloads before rendering.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `bun run typecheck`
- Candidate schema matches the committed types: `OPENAPI_SPEC_PATH=… bun run generate-types --check`

---

## Phase 2: Command

### Overview

Name handling, scope, rendering and errors.

### Changes Required:

#### 1. Command module

**File**: `src/commands/skill.ts`, registered in `src/index.ts`

**Intent**: `normalizeSkillName` accepts `/`, `$`, any case, and bare `plan` → `10x-plan`; `suggestSkills` uses a tolerance of `max(1, min(3, floor(len/3)))`; `renderOverview` with EN/PL labels; `--course`, `--lang`.

**Contract**: errors `invalid_skill_name`/`invalid_lang` (2), `course_not_found` (2), `auth_required` (3), `course_access_denied` (4), `skill_overview_not_found` (5, with suggestions), `skill_overviews_unsupported` (1, route missing). JSON: `{ course, overview }`.

#### 2. Shared scope

**File**: `src/commands/changelog.ts`

**Intent**: Export `resolveCourseScope()` unchanged.

### Success Criteria:

#### Automated Verification:

- Command tests pass: `bun test tests/skill-command.test.ts`
- Full suite, lint and typecheck pass: `bun test && bun run lint && bun run typecheck`

#### Manual Verification:

- Against a local toolkit worker: EN and PL render; a typo suggests; 401/403/404 map to exit codes 3/4/2

---

## Phase 3: Docs and Verification Skill

### Overview

Learner and agent docs, plus the end-to-end harness.

### Changes Required:

#### 1. Docs

**File**: `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `skills/10x-cli-guide/SKILL.md`

**Intent**: Usage, flags, exit codes, and the architecture note for `10x skill`.

#### 2. Verify skill

**File**: `.claude/skills/verify-10x-cli/scripts/fake-api.ts`, `.claude/skills/verify-10x-cli/features/skill.md`, `features/README.md`

**Intent**: A fake-api route and a `skill` feature recipe so the command can be driven end to end.

### Success Criteria:

#### Automated Verification:

- Skill validation passes: `bun run validate:cli-skills`

#### Manual Verification:

- After the toolkit route deploys and overviews are published, `10x skill 10x-plan` works against production in a 3.0 and a 4.0 project, each showing its own version

---

## Testing Strategy

### Unit Tests:

- Name normalization and suggestions, language and course validation, rendering in both languages, JSON envelope, every error mapping

### Integration Tests:

- Mocked API content helper (`tests/helpers/api-content-mock.ts`) for 200/401/403/404 and the missing route

### Manual Testing Steps:

1. Run the real CLI against the local toolkit worker seeded by the real publisher (model stubbed).
2. Check `--lang pl`, a typo, and a project without login.

## References

- Toolkit change: przeprogramowani/10x-toolkit `context/changes/skill-overviews/`
- Pattern: `src/commands/changelog.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API Client and Types

#### Automated

- [x] 1.1 Typecheck passes — cc0e820
- [x] 1.2 Candidate schema matches the committed types — cc0e820

### Phase 2: Command

#### Automated

- [x] 2.1 Command tests pass — cc0e820
- [x] 2.2 Full suite, lint and typecheck pass — cc0e820

#### Manual

- [x] 2.3 Against a local toolkit worker: EN and PL render; a typo suggests; 401/403/404 map to exit codes 3/4/2 — cc0e820

### Phase 3: Docs and Verification Skill

#### Automated

- [x] 3.1 Skill validation passes — cc0e820

#### Manual

- [ ] 3.2 After the toolkit route deploys and overviews are published, `10x skill 10x-plan` works against production in a 3.0 and a 4.0 project
