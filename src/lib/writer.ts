/**
 * Artifact writer — Phase 4 stub.
 *
 * Phase 4 implements the *planning* side only: given a `LessonBundle` and a
 * `projectRoot`, `applyBundle` computes the target path for every artifact
 * and returns a `WriteResult` describing what *would* be written. It does
 * NOT touch the filesystem.
 *
 * Phase 5 replaces this file with the real implementation — sentinel marker
 * handling in CLAUDE.md, config skip-on-exists semantics, manifest tracking,
 * and cleanup of stale artifacts from the previously-applied lesson.
 *
 * The interface is pinned in this phase so commands (`10x get`) and their
 * tests can be written against the real contract. Phase 5 is a drop-in
 * implementation swap with no command-side churn.
 */

import { join } from "node:path";
import type { LessonBundle } from "./api-content";

/**
 * Action outcomes:
 *  - `planned` — Phase 4 stub: the write was computed but not executed.
 *     Phase 5 will never emit this variant.
 *  - `created` / `updated` — Phase 5 real-write outcomes.
 *  - `skipped` — config template already exists on disk (Phase 5).
 *  - `unchanged` — idempotent re-apply (Phase 5).
 */
export type ArtifactAction =
  | "planned"
  | "created"
  | "updated"
  | "unchanged"
  | "skipped";

export interface ArtifactWrite {
  name: string;
  path: string;
  action: ArtifactAction;
}

export interface WriteResult {
  skills: ArtifactWrite[];
  prompts: ArtifactWrite[];
  rules: { action: ArtifactAction };
  configs: ArtifactWrite[];
}

export interface ApplyOptions {
  /**
   * When true, return the planned result without touching the filesystem.
   * In Phase 4 this is the *only* supported mode; when Phase 5 lands it
   * flips to opt-in.
   */
  dryRun?: boolean;
}

/**
 * Plan (Phase 4) or plan+write (Phase 5 future) a lesson bundle into the
 * project's `.claude/` layout.
 *
 * Target paths, held stable across phases:
 *   .claude/skills/<name>/SKILL.md         ← skills
 *   .claude/prompts/<name>.md              ← prompts
 *   CLAUDE.md                              ← rules (between sentinels)
 *   .claude/config-templates/<name>        ← configs
 */
export function applyBundle(
  bundle: LessonBundle,
  projectRoot: string,
  options: ApplyOptions = {},
): WriteResult {
  // Phase 4 always treats the call as a dry run — planning only. The option
  // is accepted now so command-level APIs (`10x get --dry-run`) stabilize
  // before Phase 5 introduces the real write path.
  void options.dryRun;

  const skills: ArtifactWrite[] = bundle.skills.map((skill) => ({
    name: skill.name,
    path: join(projectRoot, ".claude", "skills", skill.name, "SKILL.md"),
    action: "planned",
  }));

  const prompts: ArtifactWrite[] = bundle.prompts.map((prompt) => ({
    name: prompt.name,
    path: join(projectRoot, ".claude", "prompts", `${prompt.name}.md`),
    action: "planned",
  }));

  const configs: ArtifactWrite[] = bundle.configs.map((config) => ({
    name: config.name,
    path: join(projectRoot, ".claude", "config-templates", config.name),
    action: "planned",
  }));

  return {
    skills,
    prompts,
    rules: { action: "planned" },
    configs,
  };
}
