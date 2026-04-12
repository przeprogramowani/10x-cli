/**
 * Artifact writer — Phase 5 real implementation.
 *
 * Takes a `LessonBundle` fetched from the delivery API and applies it to a
 * project's `.claude/` directory, honoring the same sentinel marker and
 * config-skip conventions as `internal-pkg`. A `.10x-cli-manifest.json`
 * file tracks what was written so that the next apply can clean up
 * artifacts exclusive to the previous lesson.
 *
 * File layout (stable across v1):
 *   <projectRoot>/.claude/skills/<name>/SKILL.md       ← skills
 *   <projectRoot>/.claude/prompts/<name>.md            ← prompts
 *   <projectRoot>/CLAUDE.md                            ← rules (sentinel block)
 *   <projectRoot>/.claude/config-templates/<name>      ← configs (skip-on-exists)
 *   <projectRoot>/.claude/.10x-cli-manifest.json       ← manifest
 *
 * `--dry-run` returns the same `WriteResult` shape without touching the
 * filesystem. Re-apply is idempotent: a second run reports `unchanged`
 * (skills/prompts/rules) or `skipped` (configs) and produces a byte-identical
 * manifest + CLAUDE.md.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { LessonBundle } from "./api-content";
import {
  CLI_PACKAGE_NAME,
  type CliManifest,
  readManifest,
  writeManifest,
} from "./manifest";
import { applyRulesBlock } from "./sentinel-migration";
import pkgJson from "../../package.json";

const CLI_VERSION = pkgJson.version;

/** Default course slug — matches the one hardcoded in `commands/get.ts`. */
const DEFAULT_COURSE = "10xdevs3";

export type ArtifactAction =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "removed";

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
   * When true, compute and return the `WriteResult` without mutating the
   * filesystem. Callers pass this through from the `--dry-run` CLI flag.
   */
  dryRun?: boolean;
  /**
   * Course slug recorded in the manifest. Defaults to `10xdevs3` to match
   * the `get` command's default; tests and future commands can override.
   */
  course?: string;
}

/**
 * Apply a lesson bundle to a project. See module docstring for semantics.
 */
export function applyBundle(
  bundle: LessonBundle,
  projectRoot: string,
  options: ApplyOptions = {},
): WriteResult {
  const dryRun = options.dryRun === true;
  const course = options.course ?? DEFAULT_COURSE;

  const claudeDir = join(projectRoot, ".claude");
  const prevManifest = readManifest(claudeDir);

  // Refuse to write anything if the bundle contains names that could
  // escape `.claude/` — see `assertSafeName` below. This runs before any
  // filesystem mutation so a malformed/tampered bundle aborts cleanly.
  for (const skill of bundle.skills) assertSafeName(skill.name, "skill");
  for (const prompt of bundle.prompts) assertSafeName(prompt.name, "prompt");
  for (const config of bundle.configs) assertSafeName(config.name, "config");

  // --- skills -----------------------------------------------------------
  const skills: ArtifactWrite[] = bundle.skills.map((skill) => {
    const target = join(claudeDir, "skills", skill.name, "SKILL.md");
    const action = computeFileAction(target, skill.content);
    if (!dryRun && action !== "unchanged") {
      writeFileAt(target, skill.content);
    }
    return { name: skill.name, path: target, action };
  });

  // --- prompts ----------------------------------------------------------
  const prompts: ArtifactWrite[] = bundle.prompts.map((prompt) => {
    const fileName = `${prompt.name}.md`;
    const target = join(claudeDir, "prompts", fileName);
    const action = computeFileAction(target, prompt.content);
    if (!dryRun && action !== "unchanged") {
      writeFileAt(target, prompt.content);
    }
    return { name: prompt.name, path: target, action };
  });

  // --- rules (CLAUDE.md sentinel block) ---------------------------------
  const claudeMdPath = join(projectRoot, "CLAUDE.md");
  const existingClaudeMd = readFileOrEmpty(claudeMdPath);
  let rulesAction: ArtifactAction;
  if (bundle.rules.length === 0) {
    // No rules in this bundle → leave CLAUDE.md untouched.
    rulesAction = "unchanged";
  } else {
    const rulesBody = bundle.rules.map((r) => r.content.trim()).join("\n\n");
    const { content: newClaudeMd } = applyRulesBlock(existingClaudeMd, rulesBody);
    if (newClaudeMd === existingClaudeMd) {
      rulesAction = "unchanged";
    } else if (existingClaudeMd.length === 0) {
      rulesAction = "created";
    } else {
      rulesAction = "updated";
    }
    if (!dryRun && rulesAction !== "unchanged") {
      writeFileAt(claudeMdPath, newClaudeMd);
    }
  }

  // --- configs (skip-on-exists) -----------------------------------------
  const configs: ArtifactWrite[] = bundle.configs.map((config) => {
    const target = join(claudeDir, "config-templates", config.name);
    const action: ArtifactAction = existsSync(target) ? "skipped" : "created";
    if (!dryRun && action === "created") {
      writeFileAt(target, config.content);
    }
    return { name: config.name, path: target, action };
  });

  // --- cleanup of stale artifacts from the previous lesson --------------
  // Computed and executed in real mode; in dry-run mode we compute nothing
  // and touch nothing — the preview contract stays at the four-field shape.
  if (!dryRun) {
    const removed = computeRemovals(prevManifest, bundle, claudeDir);
    for (const entry of removed.skills) rmSync(entry.path, { recursive: true, force: true });
    for (const entry of removed.prompts) rmSync(entry.path, { force: true });
    for (const entry of removed.configs) rmSync(entry.path, { force: true });
  }

  // --- manifest ---------------------------------------------------------
  if (!dryRun) {
    const nextManifest: CliManifest = {
      package: CLI_PACKAGE_NAME,
      version: CLI_VERSION,
      lastApplied: new Date().toISOString(),
      lessonId: bundle.lessonId,
      course,
      files: {
        skills: bundle.skills.map((s) => s.name),
        prompts: bundle.prompts.map((p) => `${p.name}.md`),
        configs: bundle.configs.map((c) => c.name),
      },
    };
    writeManifest(claudeDir, nextManifest);
  }

  return {
    skills,
    prompts,
    rules: { action: rulesAction },
    configs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeFileAction(filePath: string, newContent: string): ArtifactAction {
  if (!existsSync(filePath)) return "created";
  let current: string;
  try {
    current = readFileSync(filePath, "utf8");
  } catch {
    return "updated";
  }
  return current === newContent ? "unchanged" : "updated";
}

function readFileOrEmpty(filePath: string): string {
  if (!existsSync(filePath)) return "";
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function writeFileAt(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

interface RemovalPlan {
  skills: { name: string; path: string }[];
  prompts: { name: string; path: string }[];
  configs: { name: string; path: string }[];
}

function computeRemovals(
  prevManifest: CliManifest | null,
  bundle: LessonBundle,
  claudeDir: string,
): RemovalPlan {
  const empty: RemovalPlan = { skills: [], prompts: [], configs: [] };
  if (!prevManifest) return empty;

  const currentSkills = new Set(bundle.skills.map((s) => s.name));
  const currentPrompts = new Set(bundle.prompts.map((p) => `${p.name}.md`));
  const currentConfigs = new Set(bundle.configs.map((c) => c.name));

  const removed: RemovalPlan = { skills: [], prompts: [], configs: [] };

  for (const skillName of prevManifest.files.skills) {
    if (currentSkills.has(skillName)) continue;
    // Defense in depth: a tampered manifest could have names that escape
    // claudeDir via `..`. Skip rather than rmSync anything scary.
    if (!isSafeName(skillName)) continue;
    removed.skills.push({ name: skillName, path: join(claudeDir, "skills", skillName) });
  }
  for (const promptFile of prevManifest.files.prompts) {
    if (currentPrompts.has(promptFile)) continue;
    if (!isSafeName(promptFile)) continue;
    removed.prompts.push({ name: promptFile, path: join(claudeDir, "prompts", promptFile) });
  }
  for (const configFile of prevManifest.files.configs) {
    if (currentConfigs.has(configFile)) continue;
    if (!isSafeName(configFile)) continue;
    removed.configs.push({
      name: configFile,
      path: join(claudeDir, "config-templates", configFile),
    });
  }
  return removed;
}

/**
 * Reject artifact names that could escape `.claude/` or shadow hidden
 * files. Applied to every bundle field and every manifest entry before
 * building a filesystem path — the delivery API already validates content
 * server-side, but the writer runs with the student's full user rights
 * and a corrupted bundle or tampered manifest should never be able to
 * write or delete outside the target directory.
 */
function assertSafeName(name: string, kind: "skill" | "prompt" | "config"): void {
  if (!isSafeName(name)) {
    throw new Error(
      `refused to write unsafe ${kind} name ${JSON.stringify(name)} — must not be empty, contain path separators, or start with '.'`,
    );
  }
}

function isSafeName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) return false;
  if (name.startsWith(".")) return false; // blocks '', '.', '..', '.hidden'
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("\0")) return false;
  // Windows-specific hardening — phase 6 ships a windows-x64 binary, so
  // these names become reachable on NTFS even though the writer targets
  // POSIX paths under `.claude/`.
  if (name.includes(":")) return false; // NTFS Alternate Data Streams
  if (/[<>"|?*]/.test(name)) return false; // NTFS reserved chars
  if (/[. ]$/.test(name)) return false; // NTFS strips trailing dot/space
  const base = name.split(".")[0]!.toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) return false;
  return true;
}
