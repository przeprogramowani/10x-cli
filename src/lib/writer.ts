/**
 * Artifact writer — applies lesson bundles to a project directory.
 *
 * Takes a `LessonBundle` fetched from the delivery API and applies it to the
 * project directory using tool-specific paths from a `ToolProfile`. Honors
 * sentinel markers and config-skip conventions. A manifest file tracks what
 * was written so that the next apply can clean up stale artifacts.
 *
 * `--dry-run` returns the same `WriteResult` shape without touching the
 * filesystem. Re-apply is idempotent: a second run reports `unchanged`
 * (skills/prompts/rules) or `skipped` (configs) and produces a byte-identical
 * manifest + rules file.
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
  MANIFEST_FILENAME,
  readManifest,
  writeManifest,
} from "./manifest";
import { applyRulesBlockWithMarkers } from "./sentinel-migration";
import { PROFILES, DEFAULT_TOOL, type ToolProfile } from "./tool-profile";
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
  /**
   * Tool profile controlling directory layout and sentinel markers.
   * Defaults to the `claude-code` profile for backward compatibility.
   */
  profile?: ToolProfile;
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
  const profile = options.profile ?? PROFILES[DEFAULT_TOOL]!;

  const manifestDir = join(projectRoot, profile.manifestDir);
  const prevManifest = readManifest(manifestDir);

  // Refuse to write anything if the bundle contains names that could
  // escape the target directory — see `assertSafeName` below. This runs
  // before any filesystem mutation so a malformed/tampered bundle aborts
  // cleanly.
  for (const skill of bundle.skills) assertSafeName(skill.name, "skill");
  for (const prompt of bundle.prompts) assertSafeName(prompt.name, "prompt");
  for (const config of bundle.configs) assertSafeName(config.name, "config");

  // --- skills -----------------------------------------------------------
  const skills: ArtifactWrite[] = bundle.skills.map((skill) => {
    const target = join(projectRoot, profile.skillPath(skill.name));
    const action = computeFileAction(target, skill.content);
    if (!dryRun && action !== "unchanged") {
      writeFileAt(target, skill.content);
    }
    return { name: skill.name, path: target, action };
  });

  // --- prompts ----------------------------------------------------------
  const prompts: ArtifactWrite[] = bundle.prompts.map((prompt) => {
    const target = join(projectRoot, profile.promptPath(prompt.name));
    const action = computeFileAction(target, prompt.content);
    if (!dryRun && action !== "unchanged") {
      writeFileAt(target, prompt.content);
    }
    return { name: prompt.name, path: target, action };
  });

  // --- rules (sentinel block in rules file) -----------------------------
  const rulesFilePath = join(projectRoot, profile.rulesFile);
  const existingRules = readFileOrEmpty(rulesFilePath);
  let rulesAction: ArtifactAction;
  if (bundle.rules.length === 0) {
    rulesAction = "unchanged";
  } else {
    const rulesBody = bundle.rules.map((r) => r.content.trim()).join("\n\n");
    const { content: newRules } = applyRulesBlockWithMarkers(
      existingRules,
      rulesBody,
      profile.sentinelBegin,
      profile.sentinelEnd,
    );
    if (newRules === existingRules) {
      rulesAction = "unchanged";
    } else if (existingRules.length === 0) {
      rulesAction = "created";
    } else {
      rulesAction = "updated";
    }
    if (!dryRun && rulesAction !== "unchanged") {
      writeFileAt(rulesFilePath, newRules);
    }
  }

  // --- configs (skip-on-exists) -----------------------------------------
  const configs: ArtifactWrite[] = bundle.configs.map((config) => {
    const target = join(projectRoot, profile.configPath(config.name));
    const action: ArtifactAction = existsSync(target) ? "skipped" : "created";
    if (!dryRun && action === "created") {
      writeFileAt(target, config.content);
    }
    return { name: config.name, path: target, action };
  });

  // --- cleanup of stale artifacts from the previous lesson --------------
  if (!dryRun) {
    const removed = computeRemovals(prevManifest, bundle, profile, projectRoot);
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
      tool: profile.toolId,
      files: {
        skills: bundle.skills.map((s) => s.name),
        prompts: bundle.prompts.map((p) => `${p.name}.md`),
        configs: bundle.configs.map((c) => c.name),
      },
    };
    writeManifest(manifestDir, nextManifest);
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
  profile: ToolProfile,
  projectRoot: string,
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
    // the target dir via `..`. Skip rather than rmSync anything scary.
    if (!isSafeName(skillName)) continue;
    // Skill paths include the directory, so remove the parent dir
    const skillTarget = join(projectRoot, profile.skillPath(skillName));
    removed.skills.push({ name: skillName, path: dirname(skillTarget) });
  }
  for (const promptFile of prevManifest.files.prompts) {
    if (currentPrompts.has(promptFile)) continue;
    if (!isSafeName(promptFile)) continue;
    // Prompt filenames in the manifest include .md; strip it for the path lookup
    const promptName = promptFile.replace(/\.md$/, "");
    removed.prompts.push({
      name: promptFile,
      path: join(projectRoot, profile.promptPath(promptName)),
    });
  }
  for (const configFile of prevManifest.files.configs) {
    if (currentConfigs.has(configFile)) continue;
    if (!isSafeName(configFile)) continue;
    removed.configs.push({
      name: configFile,
      path: join(projectRoot, profile.configPath(configFile)),
    });
  }
  return removed;
}

/**
 * Check if artifacts exist under a different tool's manifest directory.
 * Returns a warning string if orphaned artifacts are found, or null.
 */
export function detectOrphanedArtifacts(
  projectRoot: string,
  currentProfile: ToolProfile,
): string | null {
  for (const profile of Object.values(PROFILES)) {
    if (profile.toolId === currentProfile.toolId) continue;
    const otherManifest = join(projectRoot, profile.manifestDir, MANIFEST_FILENAME);
    if (existsSync(otherManifest)) {
      return `Found existing 10x artifacts in ${profile.manifestDir}/ from ${profile.displayName}.\n  Manually remove ${profile.manifestDir}/ if you no longer need it.\n  Your new artifacts will be written to ${currentProfile.manifestDir}/`;
    }
  }
  return null;
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
